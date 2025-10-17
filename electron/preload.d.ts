export type VideoItem = {
    path: string;
    name: string;
    size: number;
    mtime: number;
    ext: string;
    duration?: number;
    thumb?: string | null;
};
type Api = {
    selectFolder: () => Promise<string | null>;
    scanVideos: (dir: string, opts?: {
        recursive?: boolean;
        depth?: number;
    }) => Promise<VideoItem[]>;
    homeDir: () => Promise<string>;
    revealInExplorer: (filePath: string) => Promise<boolean>;
    getMeta: (filePath: string) => Promise<{
        duration?: number;
        thumb?: string | null;
    }>;
    listFolders: (dir: string) => Promise<Array<{
        path: string;
        name: string;
        mtime: number;
    }>>;
    getFolderCovers: () => Promise<Record<string, string>>;
    setFolderCover: (folderPath: string, imagePath: string) => Promise<{
        ok: boolean;
        url?: string;
        error?: string;
    }>;
    clearFolderCover: (folderPath: string) => Promise<boolean>;
    getLastFolder: () => Promise<string | undefined>;
    setLastFolder: (dir: string) => Promise<boolean>;
    getHistory: () => Promise<Record<string, number>>;
    markWatched: (filePath: string) => Promise<boolean>;
    selectFile: (filters?: Array<{
        name: string;
        extensions: string[];
    }>) => Promise<string | null>;
    selectFiles: (filters?: Array<{
        name: string;
        extensions: string[];
    }>) => Promise<string[]>;
    getFFPaths: () => Promise<{
        ffmpegPath?: string;
        ffprobePath?: string;
    }>;
    setFFPaths: (v: {
        ffmpegPath?: string;
        ffprobePath?: string;
    }) => Promise<boolean>;
    testFF: () => Promise<{
        ffmpegOk: boolean;
        ffprobeOk: boolean;
        ffmpegError?: string;
        ffprobeError?: string;
    }>;
    addWatchTime: (filePath: string, seconds: number) => Promise<boolean>;
    getWatchStats: (filePath: string) => Promise<{
        lastWatched: number;
        totalMinutes: number;
        last14Minutes?: number;
        lastPositionSec?: number;
    }>;
    setLastPosition: (filePath: string, seconds: number) => Promise<boolean>;
    getDailyTotals: (days?: number) => Promise<{
        dates: string[];
        seconds: number[];
    }>;
    getAppSettings: () => Promise<{
        enableHoverPreviews: boolean;
    }>;
    setAppSettings: (v: {
        enableHoverPreviews?: boolean;
    }) => Promise<boolean>;
    getAchievements: () => Promise<Array<{
        id: string;
        name: string;
        description?: string;
        icon?: string;
        rarity?: string;
        rules: any[];
        notify?: boolean;
    }>>;
    setAchievements: (defs: Array<{
        id: string;
        name: string;
        description?: string;
        icon?: string;
        rarity?: string;
        rules: any[];
        notify?: boolean;
    }>) => Promise<boolean>;
    getAchievementState: () => Promise<Record<string, {
        id: string;
        unlockedAt?: string;
        progress?: {
            current: number;
            target: number;
        };
        lastEvaluatedAt?: string;
    }>>;
    resetAchievementState: (id?: string) => Promise<boolean>;
    onAchievementUnlocked: (cb: (payload: {
        id: string;
        name: string;
        icon?: string;
        rarity?: string;
    }) => void) => () => void;
    onUpdateAvailable: (cb: (info: any) => void) => () => void;
    onUpdateDownloaded: (cb: (info: any) => void) => () => void;
    onUpdateError: (cb: (err: any) => void) => () => void;
    downloadUpdate: () => Promise<{
        ok: boolean;
        error?: string;
    }>;
    installUpdate: () => Promise<{
        ok: boolean;
        error?: string;
    }>;
    setPresence: (activity: any) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    clearPresence: () => Promise<{
        ok: boolean;
        error?: string;
    }>;
};
declare global {
    interface Window {
        api: Api;
    }
}
export {};
