import { SharedFile, SharedPayload, ShareListener } from './types';
export * from './types';
/**
 * Normalizes raw payload from native (JSON string on iOS, object on Android)
 */
export declare const parseSharedPayload: (raw: any) => SharedPayload | null;
/**
 * Reads cold-start shared payload when the app is launched from the Share Sheet.
 * This is consume-once: reading it clears the native stash.
 */
export declare function getInitialShare(): Promise<SharedPayload | null>;
/**
 * Hook to listen for both cold-start and warm/foreground share intents.
 */
export declare function useShareIntent(callback?: ShareListener): {
    hasShare: boolean;
    shareType: "text" | "file" | undefined;
    text: string | undefined;
    files: SharedFile[];
    payload: SharedPayload | null;
    reset: () => void;
};
/**
 * Outgoing system share: Opens native system chooser with files and text.
 */
export declare function shareFiles(paths: string[], text?: string): Promise<number>;
declare const _default: {
    getInitialShare: typeof getInitialShare;
    useShareIntent: typeof useShareIntent;
    parseSharedPayload: (raw: any) => SharedPayload | null;
    shareFiles: typeof shareFiles;
};
export default _default;
