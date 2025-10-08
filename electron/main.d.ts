export type VideoItem = {
    path: string;
    name: string;
    size: number;
    mtime: number;
    ext: string;
    duration?: number;
    thumb?: string | null;
};
export type FolderItem = {
    path: string;
    name: string;
    mtime: number;
};
