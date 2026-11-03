"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSharedPayload = void 0;
exports.getInitialShare = getInitialShare;
exports.useShareIntent = useShareIntent;
exports.shareFiles = shareFiles;
const react_1 = require("react");
const react_native_1 = require("react-native");
__exportStar(require("./types"), exports);
const LINKING_ERROR = `The package 'react-native-share-target' doesn't seem to be linked. Make sure: \n\n` +
    react_native_1.Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
    '- You rebuilt the app after installing the package\n' +
    '- You are not using Expo Go\n';
const getShareIntentModule = () => {
    return react_native_1.NativeModules.ShareIntentModule
        ? react_native_1.NativeModules.ShareIntentModule
        : new Proxy({}, {
            get() {
                throw new Error(LINKING_ERROR);
            },
        });
};
const getShareIntentEmitter = () => {
    return react_native_1.NativeModules.ShareIntentEmitter
        ? react_native_1.NativeModules.ShareIntentEmitter
        : new Proxy({}, {
            get() {
                throw new Error(LINKING_ERROR);
            },
        });
};
/**
 * Normalizes raw payload from native (JSON string on iOS, object on Android)
 */
const parseSharedPayload = (raw) => {
    if (!raw)
        return null;
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!data || (!data.text && (!data.files || data.files.length === 0) && !data.filePath)) {
            return null;
        }
        if (data.type === 'file' || data.files || data.filePath) {
            const filesList = data.files ? [...data.files] : [];
            if (filesList.length === 0 && data.filePath) {
                filesList.push({
                    filePath: data.filePath,
                    mimeType: data.mimeType || 'application/octet-stream',
                    uri: data.uri || data.filePath,
                    fileName: data.fileName || (data.filePath || '').split('/').pop() || 'shared_file',
                    fileSize: data.fileSize || 0,
                });
            }
            const normalised = filesList.map(f => ({
                filePath: f.filePath || f.uri || '',
                mimeType: f.mimeType || data.mimeType || 'application/octet-stream',
                uri: f.uri || f.filePath || '',
                fileName: f.fileName || (f.filePath || f.uri || '').split('/').pop() || 'shared_file',
                fileSize: f.fileSize || 0,
            }));
            return {
                type: 'file',
                mimeType: data.mimeType || 'application/octet-stream',
                files: normalised,
                text: data.text || undefined,
            };
        }
        if (data.text) {
            return {
                type: 'text',
                text: data.text,
                mimeType: 'text/plain',
            };
        }
        return null;
    }
    catch (e) {
        console.error('📤 [react-native-share-target] Error parsing payload:', e);
        return null;
    }
};
exports.parseSharedPayload = parseSharedPayload;
/**
 * Reads cold-start shared payload when the app is launched from the Share Sheet.
 * This is consume-once: reading it clears the native stash.
 */
async function getInitialShare() {
    try {
        let raw = null;
        if (react_native_1.Platform.OS === 'android') {
            const mod = getShareIntentModule();
            raw = await mod.getPendingShareData();
        }
        else if (react_native_1.Platform.OS === 'ios') {
            const mod = getShareIntentEmitter();
            raw = await mod.getSharedData();
        }
        return (0, exports.parseSharedPayload)(raw);
    }
    catch (e) {
        console.warn('📤 [react-native-share-target] getInitialShare error:', e);
        return null;
    }
}
/**
 * Hook to listen for both cold-start and warm/foreground share intents.
 */
function useShareIntent(callback) {
    const [sharedPayload, setSharedPayload] = (0, react_1.useState)(null);
    const reset = (0, react_1.useCallback)(() => {
        setSharedPayload(null);
    }, []);
    // 1. Cold start fetch
    (0, react_1.useEffect)(() => {
        getInitialShare().then(payload => {
            if (payload) {
                setSharedPayload(payload);
                callback?.(payload);
            }
        });
    }, [callback]);
    // 2. Foreground / Warm share listener
    (0, react_1.useEffect)(() => {
        let subscription;
        const handlePayload = (raw) => {
            const parsed = (0, exports.parseSharedPayload)(raw);
            if (parsed) {
                setSharedPayload(parsed);
                callback?.(parsed);
            }
        };
        if (react_native_1.Platform.OS === 'android') {
            subscription = react_native_1.DeviceEventEmitter.addListener('ShareIntentReceived', handlePayload);
        }
        else if (react_native_1.Platform.OS === 'ios') {
            const emitter = new react_native_1.NativeEventEmitter(getShareIntentEmitter());
            subscription = emitter.addListener('ShareIntentReceived', handlePayload);
        }
        return () => {
            subscription?.remove();
        };
    }, [callback]);
    return {
        hasShare: !!sharedPayload,
        shareType: sharedPayload?.type,
        text: sharedPayload?.text,
        files: sharedPayload?.files || [],
        payload: sharedPayload,
        reset,
    };
}
/**
 * Outgoing system share: Opens native system chooser with files and text.
 */
async function shareFiles(paths, text) {
    if (react_native_1.Platform.OS === 'android') {
        return getShareIntentModule().shareFiles(paths, text || null);
    }
    else if (react_native_1.Platform.OS === 'ios') {
        return getShareIntentEmitter().shareFiles(paths, text || null);
    }
    return 0;
}
exports.default = {
    getInitialShare,
    useShareIntent,
    parseSharedPayload: exports.parseSharedPayload,
    shareFiles,
};
