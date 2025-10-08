import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaFolderOpen, FaPlay, FaInfoCircle, FaSearch, FaExternalLinkAlt, FaCog } from 'react-icons/fa';
import SettingsModal from './components/SettingsModal';
import { ToastProvider, useToast } from './components/Toast';
import GameCard from './components/GameCard';
import FolderCard from './components/FolderCard';
import HoverOverlay from './components/HoverOverlay';

// Types mirrored from preload
export type VideoItem = {
  path: string;
  name: string;
  size: number;
  mtime: number;
  ext: string;
  duration?: number;
  thumb?: string | null;
};

type SortKey = 'recent' | 'name' | 'size';

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function fileUrl(p: string) {
  // Convert Windows path to file:/// URL
  const normalized = p.replace(/\\/g, '/');
  return 'file:///' + encodeURI(normalized);
}

function formatDuration(sec?: number) {
  if (!sec || !Number.isFinite(sec)) return undefined;
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const Library: React.FC = () => {
  const [folder, setFolder] = useState<string>('');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [folders, setFolders] = useState<Array<{ path: string; name: string; mtime: number }>>([]);
  const [folderCovers, setFolderCovers] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [selected, setSelected] = useState<VideoItem | null>(null);
  const [history, setHistory] = useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [categories] = useState<string[]>(['All', 'Movies', 'Clips', 'Series']);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const { show } = useToast();
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [hoverPayload, setHoverPayload] = useState<{ title: string; thumb?: string | null; lines: string[]; path?: string; lastPositionSec?: number } | null>(null);
  const [appSettings, setAppSettings] = useState<{ enableHoverPreviews: boolean }>({ enableHoverPreviews: true });
  const hoverDelayRef = useRef<number | null>(null);
  const watchTimerRef = useRef<{ path: string; lastTick: number } | null>(null);
  const posSaveTickRef = useRef<number>(0);

  useEffect(() => {
    (async () => {
      const last = await window.api.getLastFolder();
      const base = last && last.length ? last : await window.api.homeDir();
      setFolder(base);
      setHistory(await window.api.getHistory());
      try { setFolderCovers(await window.api.getFolderCovers()); } catch {}
      try { setAppSettings(await window.api.getAppSettings()); } catch {}
      const items = await window.api.scanVideos(base, { recursive: true, depth: 3 });
      setVideos(items);
      try { setFolders(await window.api.listFolders(base)); } catch {}
      refreshMeta(items);
    })();
  }, []);

  const filtered = useMemo<VideoItem[]>(() => {
    let list = videos;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(v => v.name.toLowerCase().includes(q));
    }
    switch (sort) {
      case 'name':
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case 'size':
        return [...list].sort((a, b) => b.size - a.size);
      default:
        return [...list].sort((a, b) => b.mtime - a.mtime);
    }
  }, [videos, query, sort]);

  const chooseFolder = async () => {
    const sel = await window.api.selectFolder();
    if (sel) {
      setFolder(sel);
      await window.api.setLastFolder(sel);
      const items = await window.api.scanVideos(sel, { recursive: true, depth: 3 });
      setVideos(items);
      try { setFolders(await window.api.listFolders(sel)); } catch {}
      try { setFolderCovers(await window.api.getFolderCovers()); } catch {}
      refreshMeta(items);
    }
  };

  const refreshMeta = (items: VideoItem[] = videos) => {
    // prime first fold
    for (const v of items.slice(0, 24)) {
      window.api.getMeta(v.path).then(meta => setVideos(prev => prev.map(p => p.path === v.path ? { ...p, ...meta } : p)));
    }
    // lazy queue for rest via IntersectionObserver
    setTimeout(() => {
      try {
        if (!gridRef.current) return;
        if (ioRef.current) ioRef.current.disconnect();
        ioRef.current = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement;
              const p = el.getAttribute('data-path');
              if (!p) continue;
              // unobserve to avoid duplicate fetches
              ioRef.current?.unobserve(el);
              window.api.getMeta(p).then(meta => setVideos(prev => prev.map(x => x.path === p ? { ...x, ...meta } : x)));
            }
          }
        }, { rootMargin: '200px 0px' });
        const children = gridRef.current.querySelectorAll('[data-path]');
        children.forEach((c) => ioRef.current!.observe(c));
      } catch {}
    }, 100);
  };

  const testFF = async () => {
    const res = await window.api.testFF();
    if (!res.ffmpegOk || !res.ffprobeOk) {
      const parts: string[] = [];
      if (!res.ffmpegOk) parts.push(`FFmpeg error: ${res.ffmpegError || 'not found'}`);
      if (!res.ffprobeOk) parts.push(`FFprobe error: ${res.ffprobeError || 'not found'}`);
      show(parts.join(' | '), { type: 'error' });
    } else {
      show('FFmpeg and FFprobe are configured', { type: 'success' });
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0b0f15] text-slate-100">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-800 bg-steam-panel hidden md:flex md:flex-col">
        <div className="px-4 py-4 text-lg font-semibold">Library</div>
        <div className="px-2 pb-4 space-y-1">
          {categories.map(cat => (
            <button key={cat} onClick={()=>setActiveCategory(cat)} className={`w-full text-left px-3 py-2 rounded hover:bg-slate-700/60 ${activeCategory===cat?'bg-slate-700/60':''}`}>{cat}</button>
          ))}
        </div>
        <div className="mt-auto p-3 space-y-2">
          <button onClick={() => setShowSettings(true)} className="w-full inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">
            <FaCog /> Settings
          </button>
          <button onClick={chooseFolder} className="w-full inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">
            <FaFolderOpen /> Choose Folder
          </button>
          <button onClick={testFF} className="w-full inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">Test FFmpeg</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar / hero */}
        <div className="px-6 pt-4 pb-6 border-b border-slate-800 bg-gradient-to-b from-steam-panel to-transparent">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold tracking-tight">Steam-like Player</div>
            <div className="ml-auto flex gap-2 md:hidden">
              <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">
                <FaCog />
              </button>
              <button onClick={chooseFolder} className="inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">
                <FaFolderOpen />
              </button>
            </div>
          </div>
          <div className="mt-4 flex gap-3 items-center">
            <div className="flex items-center gap-2 bg-steam-panel rounded px-3 py-2 w-full max-w-xl">
              <FaSearch className="text-slate-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search your library"
                className="bg-transparent outline-none w-full text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="bg-steam-panel text-slate-200 rounded px-3 py-2 border border-slate-800"
            >
              <option value="recent">Recently Added</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>
            <div className="text-slate-400 text-sm truncate max-w-[40%] hidden md:block" title={folder}>{folder}</div>
          </div>
        </div>

        {/* Grid: Folders (no hover overlay) then videos */}
        <div ref={gridRef} className="px-8 pb-12 grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        {folders.map(f => (
          <div key={`folder-${f.path}`}>
            <FolderCard
              title={f.name}
              cover={folderCovers[f.path]}
              meta={new Date(f.mtime).toLocaleDateString()}
              onOpen={async () => {
                setFolder(f.path);
                await window.api.setLastFolder(f.path);
                const items = await window.api.scanVideos(f.path, { recursive: true, depth: 3 });
                setVideos(items);
                try { setFolders(await window.api.listFolders(f.path)); } catch {}
                refreshMeta(items);
              }}
              onContextMenu={async (e) => {
                e.preventDefault();
                const img = await window.api.selectFile([
                  { name: 'Images', extensions: ['jpg','jpeg','png','webp'] },
                ]);
                if (!img) return;
                const res = await window.api.setFolderCover(f.path, img);
                if (res?.ok && res.url) setFolderCovers(prev => ({ ...prev, [f.path]: res.url! }));
              }}
            />
          </div>
        ))}
        {filtered.map(v => (
          <div
            key={v.path}
            data-path={v.path}
            onMouseEnter={async (e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              if (hoverDelayRef.current) window.clearTimeout(hoverDelayRef.current);
              hoverDelayRef.current = window.setTimeout(async () => {
                setHoverRect(rect);
                const stats = await window.api.getWatchStats(v.path);
                const total = Math.round(stats.totalMinutes);
                const last = stats.lastWatched ? new Date(stats.lastWatched).toLocaleString() : 'Never';
                const last14 = stats.last14Minutes ?? 0;
                setHoverPayload({
                  title: v.name,
                  thumb: v.thumb,
                  lines: [
                    `Last watched: ${last}`,
                    `Last two weeks: ${last14} min`,
                    `Total: ${total} min`,
                  ],
                  path: v.path,
                  lastPositionSec: stats.lastPositionSec,
                });
              }, 150);
            }}
            onMouseLeave={() => { if (hoverDelayRef.current) window.clearTimeout(hoverDelayRef.current); setHoverRect(null); setHoverPayload(null); }}
          >
            <GameCard
              title={v.name}
              cover={v.thumb}
              meta={[
                v.ext.toUpperCase(),
                formatBytes(v.size),
                formatDuration(v.duration),
                new Date(v.mtime).toLocaleDateString(),
              ].filter(Boolean).join(' • ')}
              watched={!!history[v.path]}
              overlayThumb={v.thumb}
              overlayDetails={[
                'FILE INFO',
                `${v.ext.toUpperCase()} • ${formatBytes(v.size)}`,
                formatDuration(v.duration) ? `Duration: ${formatDuration(v.duration)}` : undefined,
              ].filter(Boolean) as string[]}
              onPlay={() => setSelected(v)}
              onClick={() => setSelected(v)}
            />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-slate-400">No videos found in this folder. Click "Choose Folder" to select another directory.</div>
        )}
        </div>

        <HoverOverlay
          open={!!hoverRect && !!hoverPayload}
          anchorRect={hoverRect || undefined}
          title={hoverPayload?.title || ''}
          thumb={hoverPayload?.thumb}
          srcPath={appSettings.enableHoverPreviews ? hoverPayload?.path : undefined}
          startAtSec={hoverPayload?.lastPositionSec}
          lines={hoverPayload?.lines || []}
          width={260}
          offset={12}
        />

      {/* Recently Watched */}
      {Object.keys(history).length > 0 && (
        <div className="px-6 pb-6">
          <div className="text-slate-300 mb-2">Continue watching</div>
          <div className="flex gap-3 overflow-x-auto scrollbar-thin pr-2">
            {Object.entries(history).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([p])=>{
              const v = videos.find(x=>x.path===p);
              if(!v) return null;
              return (
                <button key={p} onClick={()=>setSelected(v)} className="min-w-[220px] max-w-[220px] rounded bg-steam-card border border-slate-800 text-left">
                  <div className="aspect-video bg-slate-900/60 overflow-hidden">{v.thumb ? <img src={v.thumb} className="w-full h-full object-cover" /> : null}</div>
                  <div className="p-2 text-sm truncate">{v.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Player Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setSelected(null)}>
          <div className="bg-steam-panel rounded-lg overflow-hidden w-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="font-semibold text-slate-100 truncate pr-4">{selected.name}</div>
              <button onClick={() => setSelected(null)} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700">Close</button>
            </div>
            <div className="bg-black">
              <video
                src={fileUrl(selected.path)}
                controls
                autoPlay
                className="w-full max-h-[70vh]"
                onPlay={() => {
                  window.api.markWatched(selected.path);
                  watchTimerRef.current = { path: selected.path, lastTick: Date.now() };
                }}
                onTimeUpdate={(e) => {
                  try {
                    const v = e.currentTarget as HTMLVideoElement;
                    if (v && Number.isFinite(v.currentTime)) {
                      // Save last position every ~5 seconds to avoid excessive writes
                      const now = Date.now();
                      if (now - posSaveTickRef.current > 5000) {
                        if (watchTimerRef.current?.path) {
                          window.api.setLastPosition(watchTimerRef.current.path, v.currentTime);
                        }
                        posSaveTickRef.current = now;
                      }
                    }
                  } catch {}
                }}
                onPause={(e) => {
                  const t = watchTimerRef.current; if (!t) return;
                  const sec = Math.round((Date.now() - t.lastTick) / 1000);
                  if (sec > 0) window.api.addWatchTime(t.path, sec);
                  try {
                    const v = e.currentTarget as HTMLVideoElement;
                    if (Number.isFinite(v.currentTime)) window.api.setLastPosition(t.path, v.currentTime);
                  } catch {}
                  watchTimerRef.current = null;
                }}
                onEnded={() => {
                  const t = watchTimerRef.current; if (!t) return;
                  const sec = Math.round((Date.now() - t.lastTick) / 1000);
                  if (sec > 0) window.api.addWatchTime(t.path, sec);
                  try { window.api.setLastPosition(t.path, 0); } catch {}
                  watchTimerRef.current = null;
                }}
              />
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={() => refreshMeta()}
      />
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <ToastProvider>
    <Library />
  </ToastProvider>
);

export default App;
