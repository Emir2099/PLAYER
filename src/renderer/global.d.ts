type RenderVideoItem = {
  path: string;
  name: string;
  size: number;
  mtime: number;
  ext: string;
  duration?: number;
  thumb?: string | null;
};

declare interface Window {
  api: {
    selectFolder: () => Promise<string | null>;
    scanVideos: (dir: string, opts?: { recursive?: boolean; depth?: number }) => Promise<RenderVideoItem[]>;
    homeDir: () => Promise<string>;
    revealInExplorer: (filePath: string) => Promise<boolean>;
    getMeta: (filePath: string) => Promise<{ duration?: number; thumb?: string | null }>;
  listFolders: (dir: string) => Promise<Array<{ path: string; name: string; mtime: number }>>;
  getFolderCovers: () => Promise<Record<string, string>>;
  setFolderCover: (folderPath: string, imagePath: string) => Promise<{ ok: boolean; url?: string; error?: string }>;
  clearFolderCover: (folderPath: string) => Promise<boolean>;
    getLastFolder: () => Promise<string | undefined>;
    setLastFolder: (dir: string) => Promise<boolean>;
    getHistory: () => Promise<Record<string, number>>;
    markWatched: (filePath: string) => Promise<boolean>;
    selectFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
    getFFPaths: () => Promise<{ ffmpegPath?: string; ffprobePath?: string }>;
    setFFPaths: (v: { ffmpegPath?: string; ffprobePath?: string }) => Promise<boolean>;
    testFF: () => Promise<{ ffmpegOk: boolean; ffprobeOk: boolean; ffmpegError?: string; ffprobeError?: string }>;
    addWatchTime: (filePath: string, seconds: number) => Promise<boolean>;
    getWatchStats: (filePath: string) => Promise<{ lastWatched: number; totalMinutes: number; last14Minutes?: number; lastPositionSec?: number }>;
    setLastPosition: (filePath: string, seconds: number) => Promise<boolean>;
    getAppSettings: () => Promise<{ enableHoverPreviews: boolean }>;
    setAppSettings: (v: { enableHoverPreviews?: boolean }) => Promise<boolean>;
    // UI prefs
    getUiPrefs: () => Promise<{ selectedCategoryId: string | null; categoryView: boolean }>;
    setUiPrefs: (v: { selectedCategoryId?: string | null; categoryView?: boolean }) => Promise<boolean>;
    // Item lookups
    getVideoItem: (filePath: string) => Promise<RenderVideoItem | null>;
    getFolderItem: (dir: string) => Promise<{ path: string; name: string; mtime: number } | null>;
  // Category covers
  getCategoryCovers: () => Promise<Record<string, string>>;
  setCategoryCover: (id: string, imagePath: string) => Promise<{ ok: boolean; url?: string; error?: string }>;
  clearCategoryCover: (id: string) => Promise<boolean>;
    // Categories
    getCategories: () => Promise<Array<{ id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }>>;
    createCategory: (name: string) => Promise<{ ok: boolean; category?: { id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }; error?: string }>;
    renameCategory: (id: string, name: string) => Promise<{ ok: boolean; error?: string }>;
    deleteCategory: (id: string) => Promise<{ ok: boolean; error?: string }>;
    addToCategory: (id: string, items: Array<{ type: 'video' | 'folder'; path: string }>) => Promise<{ ok: boolean; category?: { id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }; error?: string }>;
    removeFromCategory: (id: string, item: { type: 'video' | 'folder'; path: string }) => Promise<{ ok: boolean; category?: { id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }; error?: string }>;
  };
}
