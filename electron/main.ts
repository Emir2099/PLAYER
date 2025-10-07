import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import ElectronStore from 'electron-store';

const require = createRequire(import.meta.url);
// Lazy require to avoid ESM/CJS friction
const ffmpeg: any = require('fluent-ffmpeg');
const ffmpegPath: string | null = (() => {
  try { return require('ffmpeg-static'); } catch { return null; }
})();
const ffprobeStatic: { path: string } | null = (() => {
  try { return require('ffprobe-static'); } catch { return null as any; }
})();

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure ffmpeg paths if available
if (ffmpegPath) try { ffmpeg.setFfmpegPath(ffmpegPath); } catch {}
if (ffprobeStatic?.path) try { ffmpeg.setFfprobePath(ffprobeStatic.path); } catch {}

// Store
type Settings = {
  lastFolder?: string;
  watched?: Record<string, number>; // path -> last watched timestamp
};
let store: { get: (k: keyof Settings) => any; set: (k: keyof Settings, v: any) => void };
try {
  const s = new ElectronStore<Settings>({ name: 'settings' });
  store = { get: (k) => s.get(k as any), set: (k, v) => s.set(k as any, v) };
} catch {
  // Fallback: JSON file in userData
  const settingsFile = path.join(app.getPath('userData'), 'settings.json');
  let cache: Settings = {};
  const load = async () => {
    try {
      const buf = await fs.readFile(settingsFile, 'utf-8');
      cache = JSON.parse(buf || '{}');
    } catch { cache = {}; }
  };
  const save = async () => {
    try { await fs.writeFile(settingsFile, JSON.stringify(cache, null, 2), 'utf-8'); } catch {}
  };
  // Initialize synchronously best-effort
  load();
  store = {
    get: (k) => (cache as any)[k],
    set: (k, v) => { (cache as any)[k] = v; save(); },
  };
}

function getPreloadPath() {
  // Use CommonJS preload to avoid ESM import issue in sandbox
  const preload = path.join(__dirname, 'preload.cjs');
  return preload;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0b0f15',
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: getPreloadPath(),
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !isDev,
    },
    title: 'Steam-like Player'
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => (mainWindow = null));

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    await mainWindow.loadFile(indexPath);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Types
export type VideoItem = {
  path: string;
  name: string;
  size: number;
  mtime: number;
  ext: string;
  duration?: number; // Placeholder if you add ffprobe later
  thumb?: string | null; // file:// path to thumbnail if generated
};

const VIDEO_EXTS = new Set([
  'mp4','mkv','avi','mov','wmv','webm','flv','m4v','ts','mts','m2ts'
]);

type ScanOptions = { recursive?: boolean; depth?: number };

async function scanDirectory(dir: string, opts: ScanOptions = {}): Promise<VideoItem[]> {
  const { recursive = true, depth = 2 } = opts;
  const results: VideoItem[] = [];

  async function walk(current: string, d: number) {
    let entries: any[] = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          if (recursive && d < depth) await walk(fullPath, d + 1);
          continue;
        }
        const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase();
        if (!VIDEO_EXTS.has(ext)) continue;
        const stat = await fs.stat(fullPath);
        results.push({
          path: fullPath,
          name: path.basename(entry.name, path.extname(entry.name)),
          size: stat.size,
          mtime: stat.mtimeMs,
          ext,
        });
      } catch {
        // ignore
      }
    }
  }

  await walk(dir, 0);
  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

function getThumbDir() {
  const dir = path.join(app.getPath('userData'), 'thumbnails');
  return dir;
}

async function ensureDir(p: string) {
  try { await fs.mkdir(p, { recursive: true }); } catch {}
}

function hashPath(p: string) {
  return crypto.createHash('md5').update(p).digest('hex');
}

async function getVideoMeta(filePath: string): Promise<{ duration?: number; thumb?: string | null }> {
  let duration: number | undefined;
  let thumb: string | null = null;
  if (ffmpeg && ffprobeStatic?.path) {
    duration = await new Promise<number | undefined>((resolve) => {
      try {
        ffmpeg.ffprobe(filePath, (err: any, data: any) => {
          if (err) return resolve(undefined);
          const stream = data?.streams?.find((s: any) => s.codec_type === 'video');
          const dur = Number(data?.format?.duration) || Number(stream?.duration);
          resolve(Number.isFinite(dur) ? Math.round(dur) : undefined);
        });
      } catch { resolve(undefined); }
    });
  }
  // thumbnail
  if (ffmpeg && ffmpegPath && ffprobeStatic?.path) {
    const tdir = getThumbDir();
    await ensureDir(tdir);
    const name = hashPath(filePath) + '.jpg';
    const outPath = path.join(tdir, name);
    if (!existsSync(outPath)) {
      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(filePath)
            .on('error', () => resolve())
            .on('end', () => resolve())
            .screenshots({
              count: 1,
              timemarks: ['5%'],
              filename: name,
              folder: tdir,
              size: '640x?'
            });
        });
      } catch {}
    }
    if (existsSync(outPath)) {
      const url = 'file:///' + outPath.replace(/\\/g, '/');
      thumb = encodeURI(url);
    }
  }
  return { duration, thumb };
}

ipcMain.handle('dialog:selectFolder', async () => {
  const defaultPath = ((): string | undefined => {
    try { return (store.get('lastFolder') as string) || os.homedir(); } catch { return os.homedir(); }
  })();
  const options = {
    title: 'Select a video folder',
    defaultPath,
    properties: ['openDirectory', 'createDirectory'] as (
      'openDirectory' | 'createDirectory' | 'openFile' | 'multiSelections' | 'showHiddenFiles' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent'
    )[],
  };
  try {
    console.log('[dialog] selectFolder invoked with defaultPath:', defaultPath);
    const parent = BrowserWindow.getFocusedWindow();
    const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (!res.canceled && res.filePaths.length > 0) {
      const chosen = res.filePaths[0];
      try { store.set('lastFolder', chosen); } catch {}
      return chosen;
    }
    // Fallback to sync dialog
    const syncChosen = parent ? dialog.showOpenDialogSync(parent, options) : dialog.showOpenDialogSync(options);
    if (syncChosen && syncChosen.length > 0) {
      try { store.set('lastFolder', syncChosen[0]); } catch {}
      return syncChosen[0];
    }
    return null;
  } catch (e) {
    console.error('selectFolder dialog error:', e);
    return null;
  }
});

ipcMain.handle('fs:scanVideos', async (_e, dir: string, opts?: ScanOptions) => {
  if (!dir || !existsSync(dir)) return [];
  return await scanDirectory(dir, opts);
});

ipcMain.handle('os:home', () => os.homedir());

ipcMain.handle('revealInExplorer', async (_e, filePath: string) => {
  if (existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('video:getMeta', async (_e, filePath: string) => {
  return await getVideoMeta(filePath);
});

ipcMain.handle('store:getLastFolder', () => {
  try { return store.get('lastFolder'); } catch { return undefined; }
});

ipcMain.handle('store:setLastFolder', (_e, dir: string) => {
  try { store.set('lastFolder', dir); return true; } catch { return false; }
});

ipcMain.handle('history:get', () => {
  try { return store.get('watched') || {}; } catch { return {}; }
});

ipcMain.handle('history:mark', (_e, filePath: string) => {
  try {
    const map = (store.get('watched') as Record<string, number>) || {};
    map[filePath] = Date.now();
    store.set('watched', map);
    return true;
  } catch { return false; }
});
