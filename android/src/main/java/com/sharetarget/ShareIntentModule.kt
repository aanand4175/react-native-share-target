package com.sharetarget

import android.app.Activity
import android.content.ClipData
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream

/**
 * ShareIntentModule
 *
 * Receives ACTION_SEND / ACTION_SEND_MULTIPLE intents and delivers them to JS.
 * Named "ShareIntentModule" specifically to avoid collision with React Native's
 * core "ShareModule" (which is the built-in Share.share() API).
 */
class ShareIntentModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "ShareIntentModule"

        @Volatile
        var instance: ShareIntentModule? = null

        @Volatile
        private var pendingIntent: Intent? = null

        fun isShareAction(action: String?): Boolean =
            Intent.ACTION_SEND == action || Intent.ACTION_SEND_MULTIPLE == action

        /**
         * Call this from MainActivity.onCreate and MainActivity.onNewIntent:
         * ShareIntentModule.setIntent(intent)
         */
        @JvmStatic
        fun setIntent(intent: Intent?) {
            if (intent == null || !isShareAction(intent.action)) return
            pendingIntent = intent
            instance?.sendShareEvent(intent)
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = "ShareIntentModule"

    /**
     * Emits event to JS for foreground/warm share actions.
     */
    fun sendShareEvent(intent: Intent) {
        val action = intent.action
        if (!isShareAction(action)) return
        try {
            val map = if (Intent.ACTION_SEND_MULTIPLE == action) {
                handleMultipleShare(intent)
            } else {
                handleSingleShare(intent)
            }
            if (map != null) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("ShareIntentReceived", map)
                Log.d(TAG, "📤 Emitted ShareIntentReceived event to JS")
                pendingIntent = null
                clearActivityShareIntent()
            }
        } catch (e: Exception) {
            Log.e(TAG, "📤 sendShareEvent error", e)
            pendingIntent = intent
        }
    }

    /**
     * Cold-start read: JS calls this when initializing.
     */
    @ReactMethod
    fun getPendingShareData(promise: Promise) {
        try {
            val stashedIntent = pendingIntent
            if (stashedIntent != null && isShareAction(stashedIntent.action)) {
                pendingIntent = null
                clearActivityShareIntent()
                Log.d(TAG, "📤 getPendingShareData: resolved stashed intent")
                promise.resolve(parseShareIntent(stashedIntent))
                return
            }

            val activity = currentActivity
            val activityIntent = activity?.intent
            if (activityIntent != null && isShareAction(activityIntent.action)) {
                activity.intent = Intent()
                Log.d(TAG, "📤 getPendingShareData: resolved activity intent")
                promise.resolve(parseShareIntent(activityIntent))
                return
            }

            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "📤 getPendingShareData error", e)
            promise.resolve(null)
        }
    }

    /**
     * Outgoing share: Share multiple files and text to external apps.
     */
    @ReactMethod
    fun shareFiles(paths: ReadableArray, text: String?, promise: Promise) {
        try {
            val authority = "${reactContext.packageName}.fileprovider"
            val uris = ArrayList<Uri>()
            val mimes = mutableListOf<String>()
            for (i in 0 until paths.size()) {
                val raw = paths.getString(i) ?: continue
                val file = File(Uri.decode(raw.removePrefix("file://")))
                if (!file.isFile) continue
                uris.add(contentUriFor(file, authority, i))
                mimes.add(
                    MimeTypeMap.getSingleton()
                        .getMimeTypeFromExtension(file.extension.lowercase()) ?: "*/*",
                )
            }
            val hasText = !text.isNullOrBlank()
            if (uris.isEmpty() && !hasText) {
                promise.resolve(0)
                return
            }

            val send = Intent(
                if (uris.size > 1) Intent.ACTION_SEND_MULTIPLE else Intent.ACTION_SEND,
            )
            send.type = when {
                uris.isEmpty() -> "text/plain"
                mimes.distinct().size == 1 -> mimes[0]
                mimes.map { it.substringBefore('/') }.distinct().size == 1 ->
                    "${mimes[0].substringBefore('/')}/*"
                else -> "*/*"
            }
            if (uris.size == 1) {
                send.putExtra(Intent.EXTRA_STREAM, uris[0])
            } else if (uris.size > 1) {
                send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            }
            if (hasText) send.putExtra(Intent.EXTRA_TEXT, text)
            if (uris.isNotEmpty()) {
                val clip = ClipData.newRawUri(null, uris[0])
                for (k in 1 until uris.size) clip.addItem(ClipData.Item(uris[k]))
                send.clipData = clip
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            val chooser = Intent.createChooser(send, null)
            val activity = currentActivity
            if (activity != null) {
                chooser.putExtra(
                    Intent.EXTRA_EXCLUDE_COMPONENTS,
                    arrayOf(ComponentName(reactContext, activity.javaClass)),
                )
                activity.startActivity(chooser)
            } else {
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactContext.startActivity(chooser)
            }
            promise.resolve(uris.size)
        } catch (e: Exception) {
            Log.e(TAG, "📤 shareFiles error", e)
            promise.reject("E_SHARE_FILES", e.message, e)
        }
    }

    private fun contentUriFor(file: File, authority: String, index: Int): Uri =
        try {
            FileProvider.getUriForFile(reactContext, authority, file)
        } catch (e: IllegalArgumentException) {
            val dir = File(reactContext.cacheDir, "outgoing_share").apply { mkdirs() }
            val staged = File(dir, "${index}_${file.name}")
            file.copyTo(staged, overwrite = true)
            FileProvider.getUriForFile(reactContext, authority, staged)
        }

    private fun parseShareIntent(intent: Intent): WritableMap? =
        if (Intent.ACTION_SEND_MULTIPLE == intent.action) {
            handleMultipleShare(intent)
        } else {
            handleSingleShare(intent)
        }

    private fun clearActivityShareIntent() {
        try {
            val activity = currentActivity ?: return
            if (isShareAction(activity.intent?.action)) {
                activity.intent = Intent()
            }
        } catch (e: Exception) {
            Log.w(TAG, "📤 clearActivityShareIntent failed", e)
        }
    }

    private fun handleSingleShare(intent: Intent): WritableMap? {
        val rawMime = intent.type ?: "*/*"
        val extraText = intent.getStringExtra(Intent.EXTRA_TEXT)
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)

        if (rawMime.startsWith("text/") && !intent.hasExtra(Intent.EXTRA_STREAM)) {
            if (extraText.isNullOrBlank()) return null
            val map = Arguments.createMap()
            map.putString("type", "text")
            map.putString("text", extraText)
            map.putString("mimeType", "text/plain")
            if (!subject.isNullOrBlank()) map.putString("subject", subject)
            return map
        }

        val uri: Uri? = getSingleUriFromIntent(intent)
        if (uri == null) {
            if (!extraText.isNullOrBlank()) {
                val map = Arguments.createMap()
                map.putString("type", "text")
                map.putString("text", extraText)
                map.putString("mimeType", "text/plain")
                return map
            }
            return null
        }

        val resolvedMime = resolveMimeType(uri, rawMime)
        val fileInfo = copyToCacheAndGetInfo(uri, resolvedMime, 0) ?: return null

        val map = Arguments.createMap()
        map.putString("type", "file")
        map.putString("mimeType", resolvedMime)
        if (!extraText.isNullOrBlank()) map.putString("text", extraText)

        val files = Arguments.createArray()
        files.pushMap(fileInfo)
        map.putArray("files", files)
        return map
    }

    private fun handleMultipleShare(intent: Intent): WritableMap? {
        val uris = getMultipleUrisFromIntent(intent)
        if (uris.isEmpty()) return null

        val rawMime = intent.type ?: "*/*"
        val map = Arguments.createMap()
        map.putString("type", "file")
        map.putString("mimeType", rawMime)

        val files = Arguments.createArray()
        var copied = 0
        uris.forEachIndexed { index, uri ->
            val resolvedMime = resolveMimeType(uri, rawMime)
            val fileInfo = copyToCacheAndGetInfo(uri, resolvedMime, index)
            if (fileInfo != null) {
                files.pushMap(fileInfo)
                copied++
            }
        }
        if (copied == 0) return null

        map.putArray("files", files)
        return map
    }

    @Suppress("DEPRECATION")
    private fun getSingleUriFromIntent(intent: Intent): Uri? {
        val extraStream = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        if (extraStream != null) return extraStream

        val clipData = intent.clipData
        if (clipData != null && clipData.itemCount > 0) {
            return clipData.getItemAt(0).uri
        }

        return intent.data
    }

    @Suppress("DEPRECATION")
    private fun getMultipleUrisFromIntent(intent: Intent): List<Uri> {
        val list = mutableListOf<Uri>()
        val extraList = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
        if (!extraList.isNullOrEmpty()) {
            list.addAll(extraList)
        }

        val clipData = intent.clipData
        if (clipData != null) {
            for (i in 0 until clipData.itemCount) {
                val u = clipData.getItemAt(i).uri
                if (u != null && !list.contains(u)) {
                    list.add(u)
                }
            }
        }
        return list
    }

    private fun resolveMimeType(uri: Uri, fallback: String): String {
        if (fallback.isNotBlank() && fallback != "*/*") return fallback
        return try {
            reactContext.contentResolver.getType(uri)?.takeIf { it.isNotBlank() }
                ?: "application/octet-stream"
        } catch (e: Exception) {
            "application/octet-stream"
        }
    }

    private fun copyToCacheAndGetInfo(uri: Uri, mimeType: String, index: Int): WritableMap? {
        val map = Arguments.createMap()
        var name = "shared_file"

        try {
            if (uri.scheme == "content") {
                reactContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (nameIdx >= 0) {
                            val n = cursor.getString(nameIdx)
                            if (!n.isNullOrBlank()) name = n
                        }
                    }
                }
            } else if (uri.scheme == "file") {
                name = uri.lastPathSegment ?: name
            }

            if (!name.contains('.')) {
                val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
                if (ext != null) name = "$name.$ext"
            }

            name = name.replace(Regex("[^a-zA-Z0-9._\\-]"), "_")

            val cacheDir = File(reactContext.cacheDir, "SharedFiles")
            if (!cacheDir.exists()) cacheDir.mkdirs()

            val destFile = File(cacheDir, "${System.nanoTime()}_${index}_$name")
            val copied = reactContext.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(destFile).use { output ->
                    input.copyTo(output, bufferSize = 8192)
                }
                true
            } ?: false

            if (!copied || destFile.length() == 0L) {
                destFile.delete()
                return null
            }

            map.putString("filePath", destFile.absolutePath)
            map.putString("uri", Uri.fromFile(destFile).toString())
            map.putString("mimeType", mimeType)
            map.putString("fileName", name)
            map.putDouble("fileSize", destFile.length().toDouble())
            return map
        } catch (e: Exception) {
            Log.e(TAG, "📤 copyToCacheAndGetInfo error", e)
            return null
        }
    }
}

