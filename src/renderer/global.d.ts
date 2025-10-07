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
    getLastFolder: () => Promise<string | undefined>;
    setLastFolder: (dir: string) => Promise<boolean>;
    getHistory: () => Promise<Record<string, number>>;
    markWatched: (filePath: string) => Promise<boolean>;
    selectFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
    getFFPaths: () => Promise<{ ffmpegPath?: string; ffprobePath?: string }>;
    setFFPaths: (v: { ffmpegPath?: string; ffprobePath?: string }) => Promise<boolean>;
    testFF: () => Promise<{ ffmpegOk: boolean; ffprobeOk: boolean; ffmpegError?: string; ffprobeError?: string }>;
    addWatchTime: (filePath: string, seconds: number) => Promise<boolean>;
    getWatchStats: (filePath: string) => Promise<{ lastWatched: number; totalMinutes: number }>;
  };
}
