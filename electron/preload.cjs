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
  clearFolderCover: (folderPath) => ipcRenderer.invoke('folder:clearCover', folderPath),
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
  getDailyTotals: (d) => ipcRenderer.invoke('history:getDailyTotals', d),
  getAppSettings: () => ipcRenderer.invoke('store:getAppSettings'),
  setAppSettings: (v) => ipcRenderer.invoke('store:setAppSettings', v),
  // Categories
  getCategories: () => ipcRenderer.invoke('cats:get'),
  createCategory: (name) => ipcRenderer.invoke('cats:create', name),
  renameCategory: (id, name) => ipcRenderer.invoke('cats:rename', id, name),
  deleteCategory: (id) => ipcRenderer.invoke('cats:delete', id),
  addToCategory: (id, items) => ipcRenderer.invoke('cats:addItems', id, items),
  removeFromCategory: (id, item) => ipcRenderer.invoke('cats:removeItem', id, item),
  // UI prefs
  getUiPrefs: () => ipcRenderer.invoke('ui:prefs:get'),
  setUiPrefs: (v) => ipcRenderer.invoke('ui:prefs:set', v),
  // Item fetch helpers for categories
  getVideoItem: (p) => ipcRenderer.invoke('fs:getVideoItem', p),
  getFolderItem: (p) => ipcRenderer.invoke('fs:getFolderItem', p),
  // Category covers
  getCategoryCovers: () => ipcRenderer.invoke('category:getCovers'),
  setCategoryCover: (id, imagePath) => ipcRenderer.invoke('category:setCover', id, imagePath),
  clearCategoryCover: (id) => ipcRenderer.invoke('category:clearCover'),
  // Window controls for custom title bar
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winToggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  winIsMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  winClose: () => ipcRenderer.invoke('win:close'),
  onWinMaximizeChanged: (cb) => {
    const handler = (_e, v) => cb?.(v);
    ipcRenderer.on('win:maximize-changed', handler);
    return () => ipcRenderer.off('win:maximize-changed', handler);
  }
};

contextBridge.exposeInMainWorld('api', api);
