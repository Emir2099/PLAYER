const { contextBridge, ipcRenderer } = require('electron');

const api = {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  scanVideos: (dir, opts) => ipcRenderer.invoke('fs:scanVideos', dir, opts),
  homeDir: () => ipcRenderer.invoke('os:home'),
  revealInExplorer: (p) => ipcRenderer.invoke('revealInExplorer', p),
  getMeta: (p) => ipcRenderer.invoke('video:getMeta', p),
  listFolders: (dir) => ipcRenderer.invoke('fs:listFolders', dir),
  getFolderCovers: () => ipcRenderer.invoke('folder:getCovers'),
  setFolderCover: (folderPath, imagePath) => ipcRenderer.invoke('folder:setCover', folderPath, imagePath),
  getLastFolder: () => ipcRenderer.invoke('store:getLastFolder'),
  setLastFolder: (dir) => ipcRenderer.invoke('store:setLastFolder', dir),
  getHistory: () => ipcRenderer.invoke('history:get'),
  markWatched: (p) => ipcRenderer.invoke('history:mark', p),
  selectFile: (filters) => ipcRenderer.invoke('dialog:selectFile', filters),
  getFFPaths: () => ipcRenderer.invoke('store:getFFPaths'),
  setFFPaths: (v) => ipcRenderer.invoke('store:setFFPaths', v),
  testFF: () => ipcRenderer.invoke('ff:test'),
  addWatchTime: (p, s) => ipcRenderer.invoke('history:addWatchTime', p, s),
  getWatchStats: (p) => ipcRenderer.invoke('history:getStats', p),
  setLastPosition: (p, s) => ipcRenderer.invoke('history:setLastPosition', p, s),
  getAppSettings: () => ipcRenderer.invoke('store:getAppSettings'),
  setAppSettings: (v) => ipcRenderer.invoke('store:setAppSettings', v),
};

contextBridge.exposeInMainWorld('api', api);
