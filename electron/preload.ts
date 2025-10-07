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
  getLastFolder: () => Promise<string | undefined>;
  setLastFolder: (dir: string) => Promise<boolean>;
  getHistory: () => Promise<Record<string, number>>;
  markWatched: (filePath: string) => Promise<boolean>;
  selectFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
  getFFPaths: () => Promise<{ ffmpegPath?: string; ffprobePath?: string }>;
  setFFPaths: (v: { ffmpegPath?: string; ffprobePath?: string }) => Promise<boolean>;
};

const api: Api = {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  scanVideos: (dir: string, opts?: { recursive?: boolean; depth?: number }) => ipcRenderer.invoke('fs:scanVideos', dir, opts),
  homeDir: () => ipcRenderer.invoke('os:home'),
  revealInExplorer: (p: string) => ipcRenderer.invoke('revealInExplorer', p),
  getMeta: (p: string) => ipcRenderer.invoke('video:getMeta', p),
  getLastFolder: () => ipcRenderer.invoke('store:getLastFolder'),
  setLastFolder: (dir: string) => ipcRenderer.invoke('store:setLastFolder', dir),
  getHistory: () => ipcRenderer.invoke('history:get'),
  markWatched: (p: string) => ipcRenderer.invoke('history:mark', p),
  selectFile: (filters?: Array<{ name: string; extensions: string[] }>) => ipcRenderer.invoke('dialog:selectFile', filters),
  getFFPaths: () => ipcRenderer.invoke('store:getFFPaths'),
  setFFPaths: (v: { ffmpegPath?: string; ffprobePath?: string }) => ipcRenderer.invoke('store:setFFPaths', v),
};

declare global {
  interface Window {
    api: Api;
  }
}

contextBridge.exposeInMainWorld('api', api);
