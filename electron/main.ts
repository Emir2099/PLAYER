import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import ElectronStore from 'electron-store';
import { execFile } from 'node:child_process';

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

// Configure ffmpeg paths if available (static defaults)
if (ffmpegPath) try { ffmpeg.setFfmpegPath(ffmpegPath); } catch {}
if (ffprobeStatic?.path) try { ffmpeg.setFfprobePath(ffprobeStatic.path); } catch {}

// Store
type Settings = {
  lastFolder?: string;
  watched?: Record<string, number>; // DEPRECATED: last watched timestamp
  watchStats?: Record<string, { lastWatched: number; totalMinutes: number; lastPositionSec?: number }>;
  watchDaily?: Record<string, Record<string, number>>; // path -> YYYY-MM-DD -> seconds
  ffmpegPath?: string;
  ffprobePath?: string;
  enableHoverPreviews?: boolean;
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

// Apply any previously saved custom ffmpeg/ffprobe paths
try {
  const savedFfmpeg = store?.get?.('ffmpegPath');
  const savedFfprobe = store?.get?.('ffprobePath');
  if (typeof savedFfmpeg === 'string' && savedFfmpeg) {
    try { ffmpeg.setFfmpegPath(savedFfmpeg); } catch {}
  }
  if (typeof savedFfprobe === 'string' && savedFfprobe) {
    try { ffmpeg.setFfprobePath(savedFfprobe); } catch {}
  }
} catch {}

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
  // Try to read duration using ffprobe if available via configured path or PATH
  if (ffmpeg) {
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
  if (ffmpeg) {
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

function resolveFFPaths() {
  let ff: string | undefined = undefined;
  let fp: string | undefined = undefined;
  try { ff = (store.get('ffmpegPath') as string) || undefined; } catch {}
  try { fp = (store.get('ffprobePath') as string) || undefined; } catch {}
  if (!ff && ffmpegPath) ff = ffmpegPath as string;
  if (!fp && ffprobeStatic?.path) fp = ffprobeStatic.path;
  // As a last resort, rely on PATH names
  if (!ff) ff = 'ffmpeg';
  if (!fp) fp = 'ffprobe';
  return { ffmpeg: ff, ffprobe: fp };
}

ipcMain.handle('ff:test', async () => {
  const { ffmpeg: ff, ffprobe: fp } = resolveFFPaths();
  const run = (cmd: string, args: string[]) => new Promise<{ ok: boolean; out?: string; err?: any }>(resolve => {
    try {
      execFile(cmd, args, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) return resolve({ ok: false, err: String(error?.message || error) });
        resolve({ ok: true, out: stdout || stderr });
      });
    } catch (e: any) {
      resolve({ ok: false, err: String(e?.message || e) });
    }
  });
  const [ffmpegRes, ffprobeRes] = await Promise.all([
    run(ff, ['-version']),
    run(fp, ['-version'])
  ]);
  return {
    ffmpegOk: !!ffmpegRes.ok,
    ffprobeOk: !!ffprobeRes.ok,
    ffmpegError: ffmpegRes.ok ? undefined : ffmpegRes.err,
    ffprobeError: ffprobeRes.ok ? undefined : ffprobeRes.err,
  };
});

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

ipcMain.handle('dialog:selectFile', async (_e, filters?: Array<{ name: string; extensions: string[] }>) => {
  const options = {
    title: 'Select a file',
    properties: ['openFile'] as ('openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent')[],
    filters: filters ?? [{ name: 'Executable', extensions: ['exe'] }],
  };
  const parent = BrowserWindow.getFocusedWindow();
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  if (!res.canceled && res.filePaths.length > 0) return res.filePaths[0];
  const syncRes = parent ? dialog.showOpenDialogSync(parent, options) : dialog.showOpenDialogSync(options);
  if (syncRes && syncRes.length > 0) return syncRes[0];
  return null;
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

ipcMain.handle('store:getFFPaths', () => {
  try {
    return {
      ffmpegPath: store.get('ffmpegPath'),
      ffprobePath: store.get('ffprobePath'),
    };
  } catch {
    return { ffmpegPath: undefined, ffprobePath: undefined };
  }
});

ipcMain.handle('store:setFFPaths', async (_e, val: { ffmpegPath?: string; ffprobePath?: string }) => {
  try {
    if (val.ffmpegPath) { store.set('ffmpegPath', val.ffmpegPath); try { ffmpeg.setFfmpegPath(val.ffmpegPath); } catch {} }
    if (val.ffprobePath) { store.set('ffprobePath', val.ffprobePath); try { ffmpeg.setFfprobePath(val.ffprobePath); } catch {} }
    return true;
  } catch {
    return false;
  }
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
    const stats = (store.get('watchStats') as Record<string, { lastWatched: number; totalMinutes: number }>) || {};
    const entry = stats[filePath] || { lastWatched: 0, totalMinutes: 0 };
    entry.lastWatched = Date.now();
    stats[filePath] = entry;
    store.set('watchStats', stats);
    return true;
  } catch { return false; }
});

ipcMain.handle('history:addWatchTime', (_e, filePath: string, seconds: number) => {
  try {
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    const stats = (store.get('watchStats') as Record<string, { lastWatched: number; totalMinutes: number; lastPositionSec?: number }>) || {};
    const entry = stats[filePath] || { lastWatched: 0, totalMinutes: 0 };
    entry.totalMinutes += seconds / 60;
    entry.lastWatched = Date.now();
    stats[filePath] = entry;
    store.set('watchStats', stats);
    const daily = (store.get('watchDaily') as Record<string, Record<string, number>>) || {};
    const dayKey = new Date().toISOString().slice(0, 10);
    const map = daily[filePath] || {};
    map[dayKey] = (map[dayKey] || 0) + Math.round(seconds);
    daily[filePath] = map;
    store.set('watchDaily', daily);
    return true;
  } catch { return false; }
});

ipcMain.handle('history:getStats', (_e, filePath: string) => {
  try {
    const stats = (store.get('watchStats') as Record<string, { lastWatched: number; totalMinutes: number; lastPositionSec?: number }>) || {};
    const base = stats[filePath] || { lastWatched: 0, totalMinutes: 0 };
    const daily = (store.get('watchDaily') as Record<string, Record<string, number>>) || {};
    const map = daily[filePath] || {};
    let secSum = 0;
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      secSum += map[key] || 0;
    }
    const last14Minutes = Math.round(secSum / 60);
    return { ...base, last14Minutes } as any;
  } catch { return { lastWatched: 0, totalMinutes: 0 }; }
});

ipcMain.handle('history:setLastPosition', (_e, filePath: string, seconds: number) => {
  try {
    if (!Number.isFinite(seconds) || seconds < 0) return false;
    const stats = (store.get('watchStats') as Record<string, { lastWatched: number; totalMinutes: number; lastPositionSec?: number }>) || {};
    const entry = stats[filePath] || { lastWatched: 0, totalMinutes: 0 };
    entry.lastPositionSec = Math.max(0, Math.round(seconds));
    stats[filePath] = entry;
    store.set('watchStats', stats);
    return true;
  } catch { return false; }
});

ipcMain.handle('store:getAppSettings', () => {
  try {
    const enabled = store.get('enableHoverPreviews');
    return { enableHoverPreviews: enabled === undefined ? true : !!enabled };
  } catch {
    return { enableHoverPreviews: true };
  }
});

ipcMain.handle('store:setAppSettings', (_e, v: { enableHoverPreviews?: boolean }) => {
  try {
    if (typeof v.enableHoverPreviews === 'boolean') store.set('enableHoverPreviews', v.enableHoverPreviews);
    return true;
  } catch {
    return false;
  }
});
