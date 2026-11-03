import UIKit
import UniformTypeIdentifiers

/// ShareViewController
///
/// Drop this file into your iOS Share Extension target in Xcode.
/// Pure Swift implementation: 0% React Native overhead, 0% Memory Crashes!
class ShareViewController: UIViewController {

    // ⚙️ CONFIGURE THESE TO MATCH YOUR APP:
    private let appGroupId = "group.yourcompany.yourapp.share"
    private let urlScheme = "yourapp-share://"
    private let pendingKey = "pendingShareIntent"

    private let collectLock = NSLock()
    private var collectedFiles: [[String: Any]] = []
    private var collectedText = ""
    private var hasRun = false

    private static let extractionTypes: [UTType] = [
        .image,
        .movie,
        .fileURL,
        .url,
        .plainText,
        .data,
    ]

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !hasRun else { return }
        hasRun = true
        processShare()
    }

    private func processShare() {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }

        guard !providers.isEmpty else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }

        let dispatchGroup = DispatchGroup()

        for (index, provider) in providers.enumerated() {
            dispatchGroup.enter()
            extract(from: provider, index: index, types: ShareViewController.extractionTypes) {
                dispatchGroup.leave()
            }
        }

        dispatchGroup.notify(queue: .main) { [weak self] in
            self?.finishExtraction()
        }
    }

    private func extract(from provider: NSItemProvider,
                         index: Int,
                         types: [UTType],
                         completion: @escaping () -> Void) {
        var remaining = types
        guard !remaining.isEmpty else {
            completion()
            return
        }

        let type = remaining.removeFirst()
        guard provider.hasItemConformingToTypeIdentifier(type.identifier) else {
            extract(from: provider, index: index, types: remaining, completion: completion)
            return
        }

        provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, _ in
            if self.store(item: item, as: type, from: provider, index: index) {
                completion()
            } else {
                self.extract(from: provider, index: index, types: remaining, completion: completion)
            }
        }
    }

    private func store(item: NSSecureCoding?,
                       as type: UTType,
                       from provider: NSItemProvider,
                       index: Int) -> Bool {
        guard let item = item else { return false }

        // 1. Text or URL string
        if let string = item as? String {
            if type.conforms(to: .url), let url = URL(string: string) {
                setText(url.absoluteString)
                return true
            }
            setText(string)
            return true
        }

        // 2. URL
        if let url = item as? URL {
            if url.isFileURL {
                return copyFileToAppGroup(from: url, index: index)
            } else {
                setText(url.absoluteString)
                return true
            }
        }

        // 3. Raw Data or Image in memory
        if let data = item as? Data {
            return saveDataToAppGroup(data: data, type: type, index: index)
        }

        if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.95) {
            return saveDataToAppGroup(data: data, type: .jpeg, index: index)
        }

        return false
    }

    private func copyFileToAppGroup(from sourceUrl: URL, index: Int) -> Bool {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
            return false
        }
        let sharedDir = container.appendingPathComponent("SharedFiles", isDirectory: true)
        try? FileManager.default.createDirectory(at: sharedDir, withIntermediateDirectories: true, attributes: nil)

        let filename = "\(Date().timeIntervalSince1970)_\(index)_\(sourceUrl.lastPathComponent)"
        let destUrl = sharedDir.appendingPathComponent(filename)

        let isSecured = sourceUrl.startAccessingSecurityScopedResource()
        defer { if isSecured { sourceUrl.stopAccessingSecurityScopedResource() } }

        do {
            if FileManager.default.fileExists(atPath: destUrl.path) {
                try FileManager.default.removeItem(at: destUrl)
            }
            try FileManager.default.copyItem(at: sourceUrl, to: destUrl)

            let fileSize = (try? destUrl.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            let mime = UTType(filenameExtension: destUrl.pathExtension)?.preferredMIMEType ?? "application/octet-stream"

            collectLock.lock()
            collectedFiles.append([
                "filePath": destUrl.path,
                "uri": destUrl.absoluteString,
                "fileName": sourceUrl.lastPathComponent,
                "mimeType": mime,
                "fileSize": fileSize
            ])
            collectLock.unlock()
            return true
        } catch {
            return false
        }
    }

    private func saveDataToAppGroup(data: Data, type: UTType, index: Int) -> Bool {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
            return false
        }
        let sharedDir = container.appendingPathComponent("SharedFiles", isDirectory: true)
        try? FileManager.default.createDirectory(at: sharedDir, withIntermediateDirectories: true, attributes: nil)

        let ext = type.preferredFilenameExtension ?? "bin"
        let filename = "\(Date().timeIntervalSince1970)_\(index)_shared_file.\(ext)"
        let destUrl = sharedDir.appendingPathComponent(filename)

        do {
            try data.write(to: destUrl, options: .atomic)
            let mime = type.preferredMIMEType ?? "application/octet-stream"

            collectLock.lock()
            collectedFiles.append([
                "filePath": destUrl.path,
                "uri": destUrl.absoluteString,
                "fileName": filename,
                "mimeType": mime,
                "fileSize": data.count
            ])
            collectLock.unlock()
            return true
        } catch {
            return false
        }
    }

    private func setText(_ text: String) {
        collectLock.lock()
        if collectedText.isEmpty { collectedText = text }
        collectLock.unlock()
    }

    private func finishExtraction() {
        var payload: [String: Any] = [:]
        if !collectedFiles.isEmpty {
            payload["type"] = "file"
            payload["files"] = collectedFiles
            if !collectedText.isEmpty { payload["text"] = collectedText }
        } else if !collectedText.isEmpty {
            payload["type"] = "text"
            payload["text"] = collectedText
        } else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }

        if let jsonData = try? JSONSerialization.data(withJSONObject: payload, options: []),
           let jsonString = String(data: jsonData, encoding: .utf8),
           let userDefaults = UserDefaults(suiteName: appGroupId) {
            userDefaults.set(jsonString, forKey: pendingKey)
            userDefaults.synchronize()
        }

        // Open Host App
        if let url = URL(string: urlScheme) {
            openURL(url)
        }
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    @objc func openURL(_ url: URL) {
        var responder: UIResponder? = self
        while responder != nil {
            if let application = responder as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = responder?.next
        }
    }
}

