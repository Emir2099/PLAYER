import { contextBridge, ipcRenderer } from 'electron';

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
  scanVideos: (dir: string, opts?: { recursive?: boolean; depth?: number }) => Promise<VideoItem[]>;
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
  getAppSettings: () => Promise<{ enableHoverPreviews: boolean }>;
  setAppSettings: (v: { enableHoverPreviews?: boolean }) => Promise<boolean>;
  // Achievements
  getAchievements: () => Promise<Array<{ id: string; name: string; description?: string; icon?: string; rarity?: string; rules: any[]; notify?: boolean }>>;
  setAchievements: (defs: Array<{ id: string; name: string; description?: string; icon?: string; rarity?: string; rules: any[]; notify?: boolean }>) => Promise<boolean>;
  getAchievementState: () => Promise<Record<string, { id: string; unlockedAt?: string; progress?: { current: number; target: number }; lastEvaluatedAt?: string }>>;
  resetAchievementState: (id?: string) => Promise<boolean>;
  onAchievementUnlocked: (cb: (payload: { id: string; name: string; icon?: string; rarity?: string }) => void) => () => void;
};

const api: Api = {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  scanVideos: (dir: string, opts?: { recursive?: boolean; depth?: number }) => ipcRenderer.invoke('fs:scanVideos', dir, opts),
  homeDir: () => ipcRenderer.invoke('os:home'),
  revealInExplorer: (p: string) => ipcRenderer.invoke('revealInExplorer', p),
  getMeta: (p: string) => ipcRenderer.invoke('video:getMeta', p),
  listFolders: (dir: string) => ipcRenderer.invoke('fs:listFolders', dir),
  getFolderCovers: () => ipcRenderer.invoke('folder:getCovers'),
  setFolderCover: (folderPath: string, imagePath: string) => ipcRenderer.invoke('folder:setCover', folderPath, imagePath),
  clearFolderCover: (folderPath: string) => ipcRenderer.invoke('folder:clearCover', folderPath),
  getLastFolder: () => ipcRenderer.invoke('store:getLastFolder'),
  setLastFolder: (dir: string) => ipcRenderer.invoke('store:setLastFolder', dir),
  getHistory: () => ipcRenderer.invoke('history:get'),
  markWatched: (p: string) => ipcRenderer.invoke('history:mark', p),
  selectFile: (filters?: Array<{ name: string; extensions: string[] }>) => ipcRenderer.invoke('dialog:selectFile', filters),
  selectFiles: (filters?: Array<{ name: string; extensions: string[] }>) => ipcRenderer.invoke('dialog:selectFiles', filters),
  getFFPaths: () => ipcRenderer.invoke('store:getFFPaths'),
  setFFPaths: (v: { ffmpegPath?: string; ffprobePath?: string }) => ipcRenderer.invoke('store:setFFPaths', v),
  testFF: () => ipcRenderer.invoke('ff:test'),
  addWatchTime: (p: string, s: number) => ipcRenderer.invoke('history:addWatchTime', p, s),
  getWatchStats: (p: string) => ipcRenderer.invoke('history:getStats', p),
  setLastPosition: (p: string, s: number) => ipcRenderer.invoke('history:setLastPosition', p, s),
  getDailyTotals: (d?: number) => ipcRenderer.invoke('history:getDailyTotals', d),
  getAppSettings: () => ipcRenderer.invoke('store:getAppSettings'),
  setAppSettings: (v: { enableHoverPreviews?: boolean }) => ipcRenderer.invoke('store:setAppSettings', v),
  // Achievements
  getAchievements: () => ipcRenderer.invoke('ach:get'),
  setAchievements: (defs) => ipcRenderer.invoke('ach:set', defs),
  getAchievementState: () => ipcRenderer.invoke('ach:state:get'),
  resetAchievementState: (id?: string) => ipcRenderer.invoke('ach:state:reset', id),
  onAchievementUnlocked: (cb) => {
    const listener = (_e: any, payload: any) => cb(payload);
    ipcRenderer.on('ach:unlocked', listener);
    return () => { try { ipcRenderer.removeListener('ach:unlocked', listener); } catch {} };
  },
};

declare global {
  interface Window {
    api: Api;
  }
}

contextBridge.exposeInMainWorld('api', api);
