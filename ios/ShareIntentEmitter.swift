import Foundation
import React
import UIKit

@objc(ShareIntentEmitter)
public class ShareIntentEmitter: RCTEventEmitter {

    @objc public static var shared: ShareIntentEmitter?
    @objc public static var pendingShareData: String?
    @objc public static var appGroupId: String = ""

    public override init() {
        super.init()
        ShareIntentEmitter.shared = self
    }

    public override func supportedEvents() -> [String]! {
        return ["ShareIntentReceived"]
    }

    public override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    /**
     * Call this from AppDelegate when a share URL (openURL) opens the app:
     * ShareIntentEmitter.emitShareEvent(jsonString)
     */
    @objc public static func emitShareEvent(_ jsonString: String) {
        pendingShareData = nil
        guard let emitter = shared else {
            pendingShareData = jsonString
            return
        }
        emitter.sendEvent(withName: "ShareIntentReceived", body: jsonString)
    }

    /**
     * Stash share data for cold start:
     * ShareIntentEmitter.setPendingShareData(jsonString)
     */
    @objc public static func setPendingShareData(_ jsonString: String) {
        pendingShareData = jsonString
        shared?.sendEvent(withName: "ShareIntentReceived", body: jsonString)
    }

    /**
     * Read from shared App Group container directly if openURL wasn't handled
     */
    @objc public static func readShareGroupData() -> String? {
        guard !appGroupId.isEmpty,
              let userDefaults = UserDefaults(suiteName: appGroupId),
              let json = userDefaults.string(forKey: "pendingShareIntent"),
              !json.isEmpty else {
            return nil
        }
        userDefaults.removeObject(forKey: "pendingShareIntent")
        userDefaults.synchronize()
        return json
    }

    @objc public func getSharedData(_ resolve: RCTPromiseResolveBlock,
                                    rejecter reject: RCTPromiseRejectBlock) {
        if let data = ShareIntentEmitter.pendingShareData {
            ShareIntentEmitter.pendingShareData = nil
            resolve(data)
            return
        }

        if let groupData = ShareIntentEmitter.readShareGroupData() {
            resolve(groupData)
            return
        }

        resolve(nil)
    }

    @objc public func shareFiles(_ paths: [String],
                                 text: String?,
                                 resolver resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        var items: [Any] = []
        for raw in paths {
            let path: String
            if raw.hasPrefix("file://") {
                let stripped = String(raw.dropFirst("file://".count))
                path = stripped.removingPercentEncoding ?? stripped
            } else {
                path = raw
            }
            if FileManager.default.fileExists(atPath: path) {
                items.append(URL(fileURLWithPath: path))
            }
        }
        if let text = text, !text.isEmpty {
            items.append(text)
        }
        if items.isEmpty {
            resolve(0)
            return
        }

        DispatchQueue.main.async {
            let activityVC = UIActivityViewController(activityItems: items, applicationActivities: nil)
            guard let topVC = ShareIntentEmitter.topViewController() else {
                resolve(0)
                return
            }
            if let popover = activityVC.popoverPresentationController {
                popover.sourceView = topVC.view
                popover.sourceRect = CGRect(x: topVC.view.bounds.midX, y: topVC.view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            topVC.present(activityVC, animated: true) {
                resolve(items.count)
            }
        }
    }

    private static func topViewController() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}

