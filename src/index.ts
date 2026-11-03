import { useEffect, useState, useCallback } from 'react';
import { DeviceEventEmitter, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { SharedFile, SharedPayload, ShareListener } from './types';

export * from './types';

const LINKING_ERROR =
  `The package 'react-native-share-target' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const getShareIntentModule = () => {
  return NativeModules.ShareIntentModule
    ? NativeModules.ShareIntentModule
    : new Proxy(
        {},
        {
          get() {
            throw new Error(LINKING_ERROR);
          },
        },
      );
};

const getShareIntentEmitter = () => {
  return NativeModules.ShareIntentEmitter
    ? NativeModules.ShareIntentEmitter
    : new Proxy(
        {},
        {
          get() {
            throw new Error(LINKING_ERROR);
          },
        },
      );
};

/**
 * Normalizes raw payload from native (JSON string on iOS, object on Android)
 */
export const parseSharedPayload = (raw: any): SharedPayload | null => {
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || (!data.text && (!data.files || data.files.length === 0) && !data.filePath)) {
      return null;
    }

    if (data.type === 'file' || data.files || data.filePath) {
      const filesList: SharedFile[] = data.files ? [...data.files] : [];
      if (filesList.length === 0 && data.filePath) {
        filesList.push({
          filePath: data.filePath,
          mimeType: data.mimeType || 'application/octet-stream',
          uri: data.uri || data.filePath,
          fileName: data.fileName || (data.filePath || '').split('/').pop() || 'shared_file',
          fileSize: data.fileSize || 0,
        });
      }

      const normalised: SharedFile[] = filesList.map(f => ({
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
  } catch (e) {
    console.error('📤 [react-native-share-target] Error parsing payload:', e);
    return null;
  }
};

/**
 * Reads cold-start shared payload when the app is launched from the Share Sheet.
 * This is consume-once: reading it clears the native stash.
 */
export async function getInitialShare(): Promise<SharedPayload | null> {
  try {
    let raw: any = null;
    if (Platform.OS === 'android') {
      const mod = getShareIntentModule();
      raw = await mod.getPendingShareData();
    } else if (Platform.OS === 'ios') {
      const mod = getShareIntentEmitter();
      raw = await mod.getSharedData();
    }
    return parseSharedPayload(raw);
  } catch (e) {
    console.warn('📤 [react-native-share-target] getInitialShare error:', e);
    return null;
  }
}

/**
 * Hook to listen for both cold-start and warm/foreground share intents.
 */
export function useShareIntent(callback?: ShareListener) {
  const [sharedPayload, setSharedPayload] = useState<SharedPayload | null>(null);

  const reset = useCallback(() => {
    setSharedPayload(null);
  }, []);

  // 1. Cold start fetch
  useEffect(() => {
    getInitialShare().then(payload => {
      if (payload) {
        setSharedPayload(payload);
        callback?.(payload);
      }
    });
  }, [callback]);

  // 2. Foreground / Warm share listener
  useEffect(() => {
    let subscription: any;

    const handlePayload = (raw: any) => {
      const parsed = parseSharedPayload(raw);
      if (parsed) {
        setSharedPayload(parsed);
        callback?.(parsed);
      }
    };

    if (Platform.OS === 'android') {
      subscription = DeviceEventEmitter.addListener('ShareIntentReceived', handlePayload);
    } else if (Platform.OS === 'ios') {
      const emitter = new NativeEventEmitter(getShareIntentEmitter());
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
export async function shareFiles(paths: string[], text?: string): Promise<number> {
  if (Platform.OS === 'android') {
    return getShareIntentModule().shareFiles(paths, text || null);
  } else if (Platform.OS === 'ios') {
    return getShareIntentEmitter().shareFiles(paths, text || null);
  }
  return 0;
}

export default {
  getInitialShare,
  useShareIntent,
  parseSharedPayload,
  shareFiles,
};

