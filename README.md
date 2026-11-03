# react-native-share-target 📤

> **The ultimate, battle-tested React Native library to list your app in the system Share Sheet (Share Menu) and receive shared photos, videos, files, links, and text from any app (Gallery, Chrome, YouTube, Files, WhatsApp, etc.).**

[![npm version](https://img.shields.io/npm/v/react-native-share-target.svg)](https://www.npmjs.com/package/react-native-share-target)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/bicta/react-native-share-target)

---

## 📖 Table of Contents
1. [Why this package? (Pain points solved)](#-why-this-package)
2. [How it works (Architecture)](#-how-it-works)
3. [Installation](#-installation)
4. [Quick Start (React Native Code)](#-quick-start)
5. [Android Setup (2 Minutes)](#-android-setup)
6. [iOS Setup (3 Minutes)](#-ios-setup)
7. [Outgoing Share (Bonus)](#-outgoing-share)
8. [API Reference](#-api-reference)
9. [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## ⚡ Why This Package?

Existing libraries (like `react-native-share-menu` or `react-native-receive-sharing-intent`) are either abandoned or fail on modern React Native:

| Feature / Issue | Old Libraries | `react-native-share-target` |
| :--- | :---: | :---: |
| **iOS Share Extension Memory Crash (OOM)** | ❌ **Crashes** (Loads heavy React Native bundle inside extension; iOS kills it at >30MB RAM) | ✅ **100% Pure Swift Extension** (Writes to App Group and exits immediately. Zero memory crash!) |
| **Android 11+ Scoped Storage** | ❌ Fails to read `content://` URIs | ✅ Resolves streams safely & copies to app cache with unique timestamps |
| **Multi-File Name Collision** | ❌ Files with duplicate names overwrite each other | ✅ Nano-timestamp & index prefixing guarantees zero lost files |
| **Cold-Start & Warm Share** | ❌ Stale intent duplicates or missing events | ✅ Two-tier consume-once state machine |
| **New Architecture (TurboModules)** | ❌ Broken / Build fails | ✅ Fully compatible with modern Kotlin & Swift |

---

## 🏗️ How It Works

```text
[External App (Gallery / Chrome / WhatsApp)]
                 │
                 │ User taps "Share"
                 ▼
     [System Share Sheet]  <-- Your app icon & name appear here!
                 │
                 │ User taps your app
        ┌────────┴────────┐
        ▼                 ▼
    [Android]           [iOS]
  MainActivity      ShareViewController (Swift)
   Intent filter         │ Writes to App Group Shared Container
        │                │ Calls custom URL Scheme
        ▼                ▼
   [ShareIntentModule]  [ShareIntentEmitter]
        │                │
        └────────┬───────┘
                 ▼
       React Native JavaScript
       `useShareIntent()` hook receives:
       - files: [{ filePath, uri, fileName, mimeType, fileSize }]
       - text: "Shared link or message"
```

---

## 📦 Installation

```bash
npm install react-native-share-target
# or
yarn add react-native-share-target
```

For iOS:
```bash
cd ios && pod install
```

---

## 🚀 Quick Start (React Native)

In your root component or navigator (e.g. `App.tsx`), use the `useShareIntent` hook:

```tsx
import React, { useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { useShareIntent } from 'react-native-share-target';

export default function App() {
  const { hasShare, shareType, text, files, reset } = useShareIntent();

  useEffect(() => {
    if (hasShare) {
      if (shareType === 'file') {
        console.log('User shared files from external app:', files);
        /*
          files is an array of objects:
          [
            {
              filePath: '/data/user/0/com.app/cache/SharedFiles/173000_0_photo.jpg',
              uri: 'file:///data/user/0/com.app/cache/SharedFiles/173000_0_photo.jpg',
              fileName: 'photo.jpg',
              mimeType: 'image/jpeg',
              fileSize: 2048500
            }
          ]
        */
        // Navigate to your Forward or Chat screen:
        navigation.navigate('ForwardPickerScreen', { sharedFiles: files });
      } else if (shareType === 'text') {
        console.log('User shared a link or text:', text);
        navigation.navigate('ChatScreen', { initialText: text });
      }

      // ⚠️ IMPORTANT: Reset after consuming so it doesn't trigger again on reload!
      reset();
    }
  }, [hasShare]);

  return <YourAppNavigation />;
}
```

---

## 🤖 Android Setup (Takes 2 Minutes)

### 1. Add Intent Filters to `android/app/src/main/AndroidManifest.xml`
Find your `<activity android:name=".MainActivity" ...>` and add the intent filters for the types of data you want your app to receive:

```xml
<activity
    android:name=".MainActivity"
    android:launchMode="singleTask"
    android:exported="true">

    <!-- 📤 1. Receive Shared Text / URLs (e.g. from Chrome, YouTube) -->
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
    </intent-filter>

    <!-- 📤 2. Receive Single File (Images, Videos, PDFs, etc.) -->
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="*/*" />
    </intent-filter>

    <!-- 📤 3. Receive Multiple Files (Albums, Multiple Documents) -->
    <intent-filter>
        <action android:name="android.intent.action.SEND_MULTIPLE" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="*/*" />
    </intent-filter>

</activity>
```

> **Tip:** If you only want images and videos, replace `*/*` with `image/*` and `video/*`.

---

### 2. Forward Intents in `MainActivity.kt`
Open `android/app/src/main/java/.../MainActivity.kt` and add `ShareIntentModule.setIntent(intent)` in `onCreate` and `onNewIntent`:

```kotlin
package com.yourapp

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.sharetarget.ShareIntentModule // 👈 1. Import module

class MainActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ShareIntentModule.setIntent(intent) // 👈 2. Handle cold start
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        ShareIntentModule.setIntent(intent) // 👈 3. Handle warm / background share
    }
}
```

---

## 🍏 iOS Setup (Takes 3 Minutes)

iOS requires an **App Group** and a **Share Extension** target.

### 1. Enable App Group on Main Target
1. Open your project in Xcode (`ios/YourApp.xcworkspace`).
2. Select your main app target → **Signing & Capabilities** → **+ Capability** → **App Groups**.
3. Create/select a group, e.g., `group.com.yourcompany.yourapp.share`.

---

### 2. Add Share Extension Target in Xcode
1. In Xcode menu: **File** ➔ **New** ➔ **Target...**
2. Choose **Share Extension** (under iOS Application Extension) and click **Next**.
3. Enter Product Name: `YourAppShareExtension` (Language: **Swift**).
4. Select the new extension target → **Signing & Capabilities** → **+ Capability** → **App Groups**. Check the **exact same App Group** you created in step 1 (`group.com.yourcompany.yourapp.share`).

---

### 3. Replace the Extension's `ShareViewController.swift`
Delete the generated code in `YourAppShareExtension/ShareViewController.swift` and copy the code from:
`node_modules/react-native-share-target/ios/template/ShareViewController.swift`

Configure your App Group ID and URL Scheme at the top of the file:
```swift
private let appGroupId = "group.com.yourcompany.yourapp.share" // 👈 Your App Group
private let urlScheme = "yourapp-share://"                      // 👈 Your App URL Scheme
```

---

### 4. Register URL Scheme in `Info.plist` (Main App)
Add your custom URL scheme in `ios/YourApp/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>yourapp-share</string>
    </array>
  </dict>
</array>
```

---

### 5. Forward URL in `AppDelegate.swift`
In `ios/YourApp/AppDelegate.swift`:

```swift
import react_native_share_target

// Inside application(_:open:options:) or scene(_:openURLContexts:):
override func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
    if url.scheme == "yourapp-share" {
        ShareIntentEmitter.appGroupId = "group.com.yourcompany.yourapp.share"
        if let data = ShareIntentEmitter.readShareGroupData() {
            ShareIntentEmitter.emitShareEvent(data)
        }
        return true
    }
    return super.application(app, open: url, options: options)
}
```

---

## 📤 Outgoing Share (Share files from your app to others)

This package also includes a built-in helper to open the native system chooser to share files with other apps:

```tsx
import { shareFiles } from 'react-native-share-target';

const handleExport = async () => {
  // Share one or more files + optional message
  const sharedCount = await shareFiles(
    [
      'file:///path/to/invoice.pdf',
      'file:///path/to/photo.jpg'
    ],
    'Here are your documents!'
  );
  console.log(`Shared ${sharedCount} files`);
};
```

---

## 📚 API Reference

### `useShareIntent(callback?)`
React hook that automatically listens to cold-start and warm shares.

#### Returns:
| Property | Type | Description |
| :--- | :--- | :--- |
| `hasShare` | `boolean` | `true` if a share payload is pending |
| `shareType` | `'file' \| 'text' \| undefined` | Type of shared content |
| `text` | `string \| undefined` | Shared text or web URL |
| `files` | `SharedFile[]` | Array of shared file objects |
| `payload` | `SharedPayload \| null` | Raw parsed payload |
| `reset` | `() => void` | Function to clear the active share |

#### `SharedFile` Object:
```ts
interface SharedFile {
  filePath: string;  // Absolute path on device
  uri: string;       // file:/// URI format
  fileName: string;  // e.g. "photo.jpg"
  mimeType: string;  // e.g. "image/jpeg"
  fileSize: number;  // Size in bytes
}
```

### `getInitialShare()`
```ts
function getInitialShare(): Promise<SharedPayload | null>
```
Asynchronous function to manually read the cold-start share payload. (Consume-once).

### `shareFiles(paths, text?)`
```ts
function shareFiles(paths: string[], text?: string): Promise<number>
```
Opens native system share sheet with file attachments.

---

## ❓ Troubleshooting & FAQ

#### Q: My app is not appearing in the Android Share Sheet?
**A:** Check `AndroidManifest.xml`. Ensure the `<intent-filter>` is inside the `<activity>` tag with `android:exported="true"`, and `android:launchMode="singleTask"`. Rebuild the app using `npx react-native run-android`.

#### Q: On iOS, my extension says "Container unavailable"?
**A:** Verify that the **exact same App Group** (`group.com...`) is checked in **both** the main app target AND the share extension target under Xcode's `Signing & Capabilities`. App Groups require a paid Apple Developer Account on physical devices (Simulator works without signing).

#### Q: Can I share multiple images at once from WhatsApp/Gallery?
**A:** Yes! `ACTION_SEND_MULTIPLE` on Android and `NSItemProvider` multi-attachments on iOS are fully supported. The files will arrive as a clean array in `files`.

---

## 📄 License
MIT © BICTA Team
