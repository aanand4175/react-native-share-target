export interface SharedFile {
    filePath: string;
    uri: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
}
export interface SharedPayload {
    type: 'text' | 'file';
    text?: string;
    mimeType?: string;
    files?: SharedFile[];
}
export type ShareListener = (payload: SharedPayload) => void;
