import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaFolderOpen, FaPlay, FaInfoCircle, FaSearch, FaExternalLinkAlt, FaCog } from 'react-icons/fa';
import SettingsModal from './components/SettingsModal';
import { ToastProvider, useToast } from './components/Toast';
import GameCard from './components/GameCard';
import FolderCard from './components/FolderCard';
import HoverOverlay from './components/HoverOverlay';
import ContextMenu from './components/ContextMenu';
import CategoryList from './components/CategoryList';
import CategoryCard from './components/CategoryCard';

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
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; path: string } | null>(null);
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
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'GLOBAL' | 'LIBRARY'>('GLOBAL');
  const [categoryItems, setCategoryItems] = useState<Array<{ type: 'video' | 'folder'; path: string }>>([]);
  const [categoryVideoMap, setCategoryVideoMap] = useState<Record<string, VideoItem>>({});
  const [categoryFolderMap, setCategoryFolderMap] = useState<Record<string, { path: string; name: string; mtime: number }>>({});
  const [libFolderPath, setLibFolderPath] = useState<string | null>(null);
  const [libFolderVideos, setLibFolderVideos] = useState<VideoItem[]>([]);
  const [categoryCovers, setCategoryCovers] = useState<Record<string, string>>({});
  const [categoryMenu, setCategoryMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [allCategories, setAllCategories] = useState<Array<{ id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }>>([]);

  const navigateTo = async (dir: string) => {
    setFolder(dir);
    await window.api.setLastFolder(dir);
    // Only load immediate videos in the current directory (not recursive)
    const items = await window.api.scanVideos(dir, { recursive: false });
    setVideos(items);
    try { setFolders(await window.api.listFolders(dir)); } catch {}
    refreshMeta(items);
  };

  useEffect(() => {
    (async () => {
      const last = await window.api.getLastFolder();
      const base = last && last.length ? last : await window.api.homeDir();
      try {
        const prefs = await window.api.getUiPrefs();
        setSelectedCategoryId(prefs.selectedCategoryId ?? null);
        setActiveTab(prefs.categoryView ? 'LIBRARY' : 'GLOBAL');
      } catch {}
      setHistory(await window.api.getHistory());
      try { setFolderCovers(await window.api.getFolderCovers()); } catch {}
      try { setCategoryCovers(await window.api.getCategoryCovers()); } catch {}
      try { setAppSettings(await window.api.getAppSettings()); } catch {}
      await navigateTo(base);
    })();
  }, []);

  // Load categories list when showing LIBRARY without a selected category
  useEffect(() => {
    (async () => {
      if (activeTab === 'LIBRARY' && !selectedCategoryId && !libFolderPath) {
        try {
          const cats = await window.api.getCategories();
          setAllCategories(cats as any);
        } catch {}
      }
    })();
  }, [activeTab, selectedCategoryId, libFolderPath]);

  // Lazy compute folder video counts for visible folders
  useEffect(() => {
    (async () => {
      const toCheck = folders.slice(0, 30).filter(f => folderCounts[f.path] === undefined);
      if (toCheck.length === 0) return;
      for (const f of toCheck) {
        try {
          const vids = await window.api.scanVideos(f.path, { recursive: true, depth: 3 });
          setFolderCounts(prev => ({ ...prev, [f.path]: vids.length }));
        } catch {}
      }
    })();
  }, [folders]);

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
      await navigateTo(sel);
      try { setFolderCovers(await window.api.getFolderCovers()); } catch {}
    }
  };

  // Ensure details for category items (videos/folders) are loaded even if outside current folder
  const hydrateCategoryItems = async (items: Array<{ type: 'video' | 'folder'; path: string }>) => {
    for (const it of items) {
      if (it.type === 'video') {
        const path = it.path;
        if (!videos.find(v => v.path === path) && !categoryVideoMap[path]) {
          try {
            const vi = await window.api.getVideoItem(path);
            if (vi) {
              // also try to get meta
              try {
                const meta = await window.api.getMeta(vi.path);
                Object.assign(vi, meta);
              } catch {}
              setCategoryVideoMap(prev => ({ ...prev, [path]: vi }));
            }
          } catch {}
        }
      } else if (it.type === 'folder') {
        const fpath = it.path;
        if (!categoryFolderMap[fpath]) {
          try {
            const fi = await window.api.getFolderItem(fpath);
            if (fi) setCategoryFolderMap(prev => ({ ...prev, [fpath]: fi }));
          } catch {}
        }
        if (folderCounts[fpath] === undefined) {
          try {
            const vids = await window.api.scanVideos(fpath, { recursive: true, depth: 3 });
            setFolderCounts(prev => ({ ...prev, [fpath]: vids.length }));
          } catch {}
        }
      }
    }
  };

  const openLibraryFolder = async (dir: string) => {
    try {
      setLibFolderPath(dir);
      const items = await window.api.scanVideos(dir, { recursive: false });
      setLibFolderVideos(items);
      // light meta enrich
      for (const v of items.slice(0, 24)) {
        window.api.getMeta(v.path).then(meta => setLibFolderVideos(prev => prev.map(p => p.path === v.path ? { ...p, ...meta } : p)));
      }
    } catch {}
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
    <div className="min-h-screen bg-steam-bg text-slate-200 flex">
      <div className="w-72 shrink-0 border-r border-slate-800 p-4 hidden md:block">
        <div className="flex flex-col gap-2">
          <button onClick={chooseFolder} className="w-full inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">
            <FaFolderOpen /> Choose Folder
          </button>
          <button onClick={testFF} className="w-full inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">Test FFmpeg</button>
        </div>
        <div className="mt-4">
          <CategoryList
            onSelect={async (catId)=>{
              setSelectedCategoryId(catId);
              setLibFolderPath(null);
              setLibFolderVideos([]);
              if (!catId) {
                setCategoryItems([]);
                await window.api.setUiPrefs({ selectedCategoryId: null, categoryView: activeTab==='LIBRARY' });
                return;
              }
              const all = await window.api.getCategories();
              const c = all.find((x:any)=>x.id===catId);
              setCategoryItems(c?.items || []);
              await window.api.setUiPrefs({ selectedCategoryId: catId, categoryView: activeTab==='LIBRARY' });
              await hydrateCategoryItems(c?.items || []);
            }}
          />
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

        {/* Tabs + Breadcrumbs */}
        <div className="px-6 pt-2 flex items-center gap-2">
          <div className="inline-flex rounded overflow-hidden border border-slate-800">
            <button
              className={`px-3 py-1.5 ${activeTab==='GLOBAL'?'bg-slate-800 text-white':'bg-slate-900 hover:bg-slate-800/70'}`}
              onClick={async ()=>{
                // Switch to GLOBAL: clear category selection so LIBRARY shows category cards next time
                setActiveTab('GLOBAL');
                setSelectedCategoryId(null);
                setCategoryItems([]);
                setLibFolderPath(null);
                setLibFolderVideos([]);
                await window.api.setUiPrefs({ categoryView: false, selectedCategoryId: null });
              }}
            >GLOBAL</button>
            <button
              className={`px-3 py-1.5 ${activeTab==='LIBRARY'?'bg-slate-800 text-white':'bg-slate-900 hover:bg-slate-800/70'}`}
              onClick={async ()=>{
                setActiveTab('LIBRARY');
                await window.api.setUiPrefs({ categoryView: true });
              }}
            >LIBRARY</button>
          </div>
        </div>
        <div className="px-8 py-3">
          <div className="text-sm text-slate-300/90 overflow-x-auto whitespace-nowrap scrollbar-thin pr-2">
            {(() => {
              const segs: Array<{ label: string; path: string }> = [];
              if (/^[A-Za-z]:\\/.test(folder)) {
                const drive = folder.slice(0, 3);
                segs.push({ label: drive, path: drive });
                const rest = folder.slice(3).split('\\').filter(Boolean);
                let acc = drive;
                for (const part of rest) {
                  acc = acc.endsWith('\\') ? acc + part : acc + '\\' + part;
                  segs.push({ label: part, path: acc });
                }
              } else if (folder) {
                const rest = folder.split('\\').filter(Boolean);
                let acc = '';
                for (const part of rest) {
                  acc = acc ? acc + '\\' + part : part;
                  segs.push({ label: part, path: acc });
                }
              }
              return (
                <>
                  {segs.map((s, i) => (
                    <span key={s.path}>
                      {i>0 && <span className="mx-1 text-slate-500">/</span>}
                      <button className={`hover:underline ${i===segs.length-1? 'text-white' : 'text-slate-200'}`} onClick={() => navigateTo(s.path)}>{s.label}</button>
                    </span>
                  ))}
                </>
              );
            })()}
          </div>
        </div>

  {/* Grid: GLOBAL shows folder/videos; LIBRARY shows selected category */}
        <div ref={gridRef} className="px-8 pb-12 grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        {activeTab==='LIBRARY' ? (
          <>
            {/* LIBRARY: either category cards list (no selection), category items grid, or drill-in folder videos */}
            {!selectedCategoryId && !libFolderPath && allCategories.length === 0 && (
              <div className="text-slate-400">No categories yet. Use the + in the sidebar to create one.</div>
            )}
            {libFolderPath && (
              <div className="col-span-full -mt-2 mb-2 text-sm text-slate-300/90">
                <button className="text-slate-200 hover:underline" onClick={()=> setLibFolderPath(null)}>Back to category</button>
                <span className="mx-2 text-slate-500">/</span>
                <span className="text-slate-100">{libFolderPath.split('\\').pop() || libFolderPath}</span>
              </div>
            )}
            {(!selectedCategoryId && !libFolderPath) ? (
              // Show all categories as cards
              allCategories.map((c) => (
                <div key={c.id} onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); setCategoryMenu({ x: e.clientX, y: e.clientY, id: c.id }); }}>
                  <CategoryCard
                    title={c.name}
                    cover={categoryCovers[c.id]}
                    meta={`${c.items.length} ${c.items.length===1?'item':'items'}`}
                    onOpen={async () => {
                      setSelectedCategoryId(c.id);
                      const all = await window.api.getCategories();
                      const found = all.find((x:any)=>x.id===c.id);
                      setCategoryItems(found?.items || []);
                      await hydrateCategoryItems(found?.items || []);
                    }}
                    onDropImage={async (imgPath) => {
                      const res = await window.api.setCategoryCover(c.id, imgPath);
                      if (res?.ok && res.url) setCategoryCovers(prev => ({ ...prev, [c.id]: res.url! }));
                    }}
                  />
                </div>
              ))
            ) : libFolderPath ? (
              libFolderVideos.map((vItem, idx) => (
                <div key={`lib-folder-video-${idx}`}
                     data-path={vItem.path}
                     draggable
                     onDragStart={(e)=>{
                       const payload = JSON.stringify([{ type: 'video', path: vItem.path, sourceCategoryId: selectedCategoryId }]);
                       e.dataTransfer.setData('application/x-player-item', payload);
                       e.dataTransfer.effectAllowed = 'copy';
                     }}
                     onMouseEnter={async (e) => {
                       const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                       if (hoverDelayRef.current) window.clearTimeout(hoverDelayRef.current);
                       hoverDelayRef.current = window.setTimeout(async () => {
                         setHoverRect(rect);
                         const stats = await window.api.getWatchStats(vItem.path);
                         const total = Math.round(stats.totalMinutes);
                         const last = stats.lastWatched ? new Date(stats.lastWatched).toLocaleString() : 'Never';
                         const last14 = stats.last14Minutes ?? 0;
                         setHoverPayload({
                           title: vItem.name,
                           thumb: vItem.thumb,
                           lines: [
                             `Last watched: ${last}`,
                             `Last two weeks: ${last14} min`,
                             `Total: ${total} min`,
                           ],
                           path: vItem.path,
                           lastPositionSec: stats.lastPositionSec,
                         });
                       }, 150);
                     }}
                     onMouseLeave={() => { if (hoverDelayRef.current) window.clearTimeout(hoverDelayRef.current); setHoverRect(null); setHoverPayload(null); }}
                >
                  <GameCard
                    title={vItem.name}
                    cover={vItem.thumb}
                    meta={[
                      vItem.ext.toUpperCase(),
                      formatBytes(vItem.size),
                      formatDuration(vItem.duration),
                      new Date(vItem.mtime).toLocaleDateString(),
                    ].filter(Boolean).join(' • ')}
                    watched={!!history[vItem.path]}
                    overlayThumb={vItem.thumb}
                    overlayDetails={[
                      'FILE INFO',
                      `${vItem.ext.toUpperCase()} • ${formatBytes(vItem.size)}`,
                      formatDuration(vItem.duration) ? `Duration: ${formatDuration(vItem.duration)}` : undefined,
                    ].filter(Boolean) as string[]}
                    onPlay={() => setSelected(vItem)}
                    onClick={() => setSelected(vItem)}
                  />
                </div>
              ))
            ) : (
              categoryItems.map((it, idx) => {
                if (it.type === 'folder') {
                  const fPath = it.path;
                  const info = categoryFolderMap[fPath];
                  const name = info?.name || fPath.split('\\').pop() || fPath;
                  const cover = folderCovers[fPath];
                  const count = folderCounts[fPath];
                  const meta = `${count===undefined? '…' : `${count} ${count===1?'video':'videos'}`} • in category`;
                  return (
                    <div key={`cat-folder-${idx}`}
                         draggable
                         onDragStart={(e)=>{
                           const payload = JSON.stringify([{ type: 'folder', path: fPath, sourceCategoryId: selectedCategoryId }]);
                           e.dataTransfer.setData('application/x-player-item', payload);
                           e.dataTransfer.effectAllowed = 'copy';
                         }}
                    >
                      <FolderCard
                        title={name}
                        cover={cover}
                        meta={meta}
                        onOpen={async () => { await openLibraryFolder(fPath); }}
                        onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); setFolderMenu({ x: e.clientX, y: e.clientY, path: fPath }); }}
                        onDropImage={async (imgPath) => {
                          const res = await window.api.setFolderCover(fPath, imgPath);
                          if (res?.ok && res.url) setFolderCovers(prev => ({ ...prev, [fPath]: res.url! }));
                        }}
                      />
                    </div>
                  );
                } else {
                  const vPath = it.path as string;
                  const vItem = videos.find(x=>x.path===vPath) || categoryVideoMap[vPath];
                  if (!vItem) return null;
                  return (
                    <div key={`cat-video-${idx}`}
                         data-path={vItem.path}
                         draggable
                         onDragStart={(e)=>{
                           const payload = JSON.stringify([{ type: 'video', path: vItem.path, sourceCategoryId: selectedCategoryId }]);
                           e.dataTransfer.setData('application/x-player-item', payload);
                           e.dataTransfer.effectAllowed = 'copy';
                         }}
                         onMouseEnter={async (e) => {
                           const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                           if (hoverDelayRef.current) window.clearTimeout(hoverDelayRef.current);
                           hoverDelayRef.current = window.setTimeout(async () => {
                             setHoverRect(rect);
                             const stats = await window.api.getWatchStats(vItem.path);
                             const total = Math.round(stats.totalMinutes);
                             const last = stats.lastWatched ? new Date(stats.lastWatched).toLocaleString() : 'Never';
                             const last14 = stats.last14Minutes ?? 0;
                             setHoverPayload({
                               title: vItem.name,
                               thumb: vItem.thumb,
                               lines: [
                                 `Last watched: ${last}`,
                                 `Last two weeks: ${last14} min`,
                                 `Total: ${total} min`,
                               ],
                               path: vItem.path,
                               lastPositionSec: stats.lastPositionSec,
                             });
                           }, 150);
                         }}
                         onMouseLeave={() => { if (hoverDelayRef.current) window.clearTimeout(hoverDelayRef.current); setHoverRect(null); setHoverPayload(null); }}
                    >
                      <GameCard
                        title={vItem.name}
                        cover={vItem.thumb}
                        meta={[
                          vItem.ext.toUpperCase(),
                          formatBytes(vItem.size),
                          formatDuration(vItem.duration),
                          new Date(vItem.mtime).toLocaleDateString(),
                        ].filter(Boolean).join(' • ')}
                        watched={!!history[vItem.path]}
                        overlayThumb={vItem.thumb}
                        overlayDetails={[
                          'FILE INFO',
                          `${vItem.ext.toUpperCase()} • ${formatBytes(vItem.size)}`,
                          formatDuration(vItem.duration) ? `Duration: ${formatDuration(vItem.duration)}` : undefined,
                        ].filter(Boolean) as string[]}
                        onPlay={() => setSelected(vItem)}
                        onClick={() => setSelected(vItem)}
                      />
                    </div>
                  );
                }
              })
            )}
          </>
        ) : (
          <>
        {folders.map(f => {
          const count = folderCounts[f.path];
          const countText = count === undefined ? '…' : `${count} ${count===1?'video':'videos'}`;
          return (
            <div key={`folder-${f.path}`}
                 draggable
                 onDragStart={(e)=>{
                   const payload = JSON.stringify([{ type: 'folder', path: f.path }]);
                   e.dataTransfer.setData('application/x-player-item', payload);
                   e.dataTransfer.effectAllowed = 'copy';
                 }}
            >
              <FolderCard
                title={f.name}
                cover={folderCovers[f.path]}
                meta={`${countText} • ${new Date(f.mtime).toLocaleDateString()}`}
                onOpen={() => navigateTo(f.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFolderMenu({ x: e.clientX, y: e.clientY, path: f.path });
                }}
                onDropImage={async (imgPath) => {
                  const res = await window.api.setFolderCover(f.path, imgPath);
                  if (res?.ok && res.url) setFolderCovers(prev => ({ ...prev, [f.path]: res.url! }));
                }}
              />
            </div>
          );
        })}
        {filtered.map(v => (
          <div
            key={v.path}
            data-path={v.path}
            draggable
            onDragStart={(e)=>{
              const payload = JSON.stringify([{ type: 'video', path: v.path }]);
              e.dataTransfer.setData('application/x-player-item', payload);
              e.dataTransfer.effectAllowed = 'copy';
            }}
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
          </>
        )}
        </div>

        {categoryMenu && (
          <ContextMenu
            x={categoryMenu.x}
            y={categoryMenu.y}
            onClose={() => setCategoryMenu(null)}
            items={[
              {
                label: 'Set cover image…',
                onClick: async () => {
                  const img = await window.api.selectFile([{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }]);
                  if (!img) { setCategoryMenu(null); return; }
                  const res = await window.api.setCategoryCover(categoryMenu.id, img);
                  if (res?.ok && res.url) setCategoryCovers(prev => ({ ...prev, [categoryMenu.id]: res.url! }));
                  setCategoryMenu(null);
                }
              },
              {
                label: 'Reset cover',
                onClick: async () => {
                  await window.api.clearCategoryCover(categoryMenu.id);
                  setCategoryCovers(prev => { const n = { ...prev }; delete n[categoryMenu.id]; return n; });
                  setCategoryMenu(null);
                }
              },
            ]}
          />
        )}

        {folderMenu && (
          <ContextMenu
            x={folderMenu.x}
            y={folderMenu.y}
            onClose={() => setFolderMenu(null)}
            items={[
              {
                label: 'Set cover image…',
                onClick: async () => {
                  const img = await window.api.selectFile([{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }]);
                  setFolderMenu(null);
                  if (!img) return;
                  const res = await window.api.setFolderCover(folderMenu.path, img);
                  if (res?.ok && res.url) setFolderCovers(prev => ({ ...prev, [folderMenu.path]: res.url! }));
                }
              },
              {
                label: 'Reset cover',
                onClick: async () => {
                  await window.api.clearFolderCover(folderMenu.path);
                  setFolderCovers(prev => { const n = { ...prev }; delete n[folderMenu.path]; return n; });
                  setFolderMenu(null);
                }
              },
              { label: 'Open in Explorer', onClick: async () => { await window.api.revealInExplorer(folderMenu.path); setFolderMenu(null); } },
            ]}
          />
        )}

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
