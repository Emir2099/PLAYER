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
  selectFiles: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string[]>;
    getFFPaths: () => Promise<{ ffmpegPath?: string; ffprobePath?: string }>;
    setFFPaths: (v: { ffmpegPath?: string; ffprobePath?: string }) => Promise<boolean>;
    testFF: () => Promise<{ ffmpegOk: boolean; ffprobeOk: boolean; ffmpegError?: string; ffprobeError?: string }>;
    addWatchTime: (filePath: string, seconds: number) => Promise<boolean>;
    getWatchStats: (filePath: string) => Promise<{ lastWatched: number; totalMinutes: number; last14Minutes?: number; lastPositionSec?: number }>;
    setLastPosition: (filePath: string, seconds: number) => Promise<boolean>;
  getDailyTotals: (days?: number) => Promise<{ dates: string[]; seconds: number[] }>;
  getAppSettings: () => Promise<{ enableHoverPreviews: boolean; enableScrubPreview?: boolean; enableAchievementChime?: boolean; enableAutoplayNext?: boolean; autoplayCountdownSec?: number }>;
  setAppSettings: (v: { enableHoverPreviews?: boolean; enableScrubPreview?: boolean; enableAchievementChime?: boolean; enableAutoplayNext?: boolean; autoplayCountdownSec?: number }) => Promise<boolean>;
  // Discord Rich Presence
  setPresence: (activity: any) => Promise<{ ok: boolean; error?: string }>;
  clearPresence: () => Promise<{ ok: boolean; error?: string }>;
  // Achievements
  getAchievements: () => Promise<Array<{ id: string; name: string; description?: string; icon?: string; rarity?: 'common'|'rare'|'epic'|'legendary'; rules: Array<{ metric: string; operator: string; target: number; window?: { rollingDays?: number }; filters?: { videos?: string[]; categories?: string[]; exts?: string[] } }>; notify?: boolean }>>;
  setAchievements: (defs: Array<{ id: string; name: string; description?: string; icon?: string; rarity?: 'common'|'rare'|'epic'|'legendary'; rules: Array<{ metric: string; operator: string; target: number; window?: { rollingDays?: number }; filters?: { videos?: string[]; categories?: string[]; exts?: string[] } }>; notify?: boolean }>) => Promise<boolean>;
  getAchievementState: () => Promise<Record<string, { id: string; unlockedAt?: string; progress?: { current: number; target: number }; lastEvaluatedAt?: string }>>;
  resetAchievementState: (id?: string) => Promise<boolean>;
  onAchievementUnlocked: (cb: (payload: { id: string; name: string; icon?: string; rarity?: 'common'|'rare'|'epic'|'legendary' }) => void) => () => void;
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
    // Window controls
    winMinimize: () => Promise<boolean>;
    winToggleMaximize: () => Promise<boolean>;
    winIsMaximized: () => Promise<boolean>;
    winClose: () => Promise<boolean>;
    onWinMaximizeChanged: (cb: (isMax: boolean) => void) => () => void;
    // Categories
    getCategories: () => Promise<Array<{ id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }>>;
    createCategory: (name: string) => Promise<{ ok: boolean; category?: { id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }; error?: string }>;
    renameCategory: (id: string, name: string) => Promise<{ ok: boolean; error?: string }>;
    deleteCategory: (id: string) => Promise<{ ok: boolean; error?: string }>;
    addToCategory: (id: string, items: Array<{ type: 'video' | 'folder'; path: string }>) => Promise<{ ok: boolean; category?: { id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }; error?: string }>;
    removeFromCategory: (id: string, item: { type: 'video' | 'folder'; path: string }) => Promise<{ ok: boolean; category?: { id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }; error?: string }>;
  };
}
