import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaFolderOpen, FaPlay, FaInfoCircle, FaSearch, FaExternalLinkAlt, FaCog, FaMinus, FaWindowMaximize, FaWindowRestore, FaTimes, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
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
  const [isMax, setIsMax] = useState(false);
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
  const [activeTab, setActiveTab] = useState<'GLOBAL' | 'LIBRARY' | 'INSIGHTS'>('GLOBAL');
  const [categoryItems, setCategoryItems] = useState<Array<{ type: 'video' | 'folder'; path: string }>>([]);
  const [categoryVideoMap, setCategoryVideoMap] = useState<Record<string, VideoItem>>({});
  const [categoryFolderMap, setCategoryFolderMap] = useState<Record<string, { path: string; name: string; mtime: number }>>({});
  const [libFolderPath, setLibFolderPath] = useState<string | null>(null);
  const [libFolderVideos, setLibFolderVideos] = useState<VideoItem[]>([]);
  const [categoryCovers, setCategoryCovers] = useState<Record<string, string>>({});
  const [categoryMenu, setCategoryMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [allCategories, setAllCategories] = useState<Array<{ id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }>>([]);
  const [bootOverlay, setBootOverlay] = useState(true);
  const [showTabSwitcher, setShowTabSwitcher] = useState(false);
  // Sidebar animation: expanded controls width; contentVisible controls fade
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sidebarContentVisible, setSidebarContentVisible] = useState(true);
  const sidebarAnimTimers = useRef<number[]>([]);
  // INSIGHTS carousels (pagination & scroll)
  const recentScrollRef = useRef<HTMLDivElement | null>(null);
  const completedScrollRef = useRef<HTMLDivElement | null>(null);
  const [recentPage, setRecentPage] = useState(0);
  const [recentPages, setRecentPages] = useState(0);
  const [completedPage, setCompletedPage] = useState(0);
  const [completedPages, setCompletedPages] = useState(0);

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
        if (typeof (prefs as any).sidebarOpen === 'boolean') {
          const open = !!(prefs as any).sidebarOpen;
          setSidebarExpanded(open);
          setSidebarContentVisible(open);
        }
      } catch {}
      setHistory(await window.api.getHistory());
      try { setFolderCovers(await window.api.getFolderCovers()); } catch {}
      try { setCategoryCovers(await window.api.getCategoryCovers()); } catch {}
      try { setAppSettings(await window.api.getAppSettings()); } catch {}
      await navigateTo(base);
      // After initial data is ready, fade out boot overlay
      setTimeout(() => setBootOverlay(false), 300);
    })();
  }, []);

  // Remove any initial focus from titlebar buttons to avoid white outline on startup
  useEffect(() => {
    try {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.classList?.contains('is-win-btn')) {
        el.blur();
      }
    } catch {}
  }, []);

  // Listen to maximize changes and get initial state
  useEffect(() => {
    let off: (() => void) | undefined;
    try {
      off = window.api.onWinMaximizeChanged?.((v) => setIsMax(!!v));
      window.api.winIsMaximized?.().then(v => setIsMax(!!v));
    } catch {}
    return () => { try { off?.(); } catch {} };
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

  // Compute page counts for INSIGHTS carousels
  useEffect(() => {
    const computePages = (el: HTMLDivElement | null) => {
      if (!el) return 0;
      const vw = el.clientWidth || 1;
      const sw = el.scrollWidth || 0;
      return Math.max(1, Math.ceil(sw / vw));
    };
    const update = () => {
      setRecentPages(computePages(recentScrollRef.current));
      setCompletedPages(computePages(completedScrollRef.current));
    };
    update();
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [/* recompute when data changes */ videos.length]);

  const handleRecentScroll = () => {
    const el = recentScrollRef.current;
    if (!el) return;
    const vw = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / vw);
    setRecentPage(Math.max(0, Math.min(idx, Math.max(0, recentPages - 1))));
  };
  const handleCompletedScroll = () => {
    const el = completedScrollRef.current;
    if (!el) return;
    const vw = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / vw);
    setCompletedPage(Math.max(0, Math.min(idx, Math.max(0, completedPages - 1))));
  };

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

  // -------------------- INSIGHTS --------------------
  type InsightData = {
    totalMinutes: number;
    last14Minutes: number;
    totalItems: number;
    byExt: Array<{ key: string; count: number; minutes: number }>; // top 6
    byFolder: Array<{ key: string; minutes: number }>; // top 6
    recent: Array<{ path: string; name: string; thumb?: string | null }>; // up to 8
    mostWatchedVideo?: { path: string; name: string; minutes: number; thumb?: string | null };
    mostWatchedCategory?: { id?: string; name: string; minutes: number };
    completedCount: number;
    completed: Array<{ path: string; name: string; thumb?: string | null }>; // up to 12
  };
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [dailyTotals, setDailyTotals] = useState<{ dates: string[]; minutes: number[] }>({ dates: [], minutes: [] });

  const buildInsights = async () => {
    try {
      setInsightsLoading(true);
      const entries = Object.entries(history);
  if (!entries.length) { setInsights({ totalMinutes:0, last14Minutes:0, totalItems:0, byExt:[], byFolder:[], recent:[], completedCount:0, completed:[] }); setInsightsLoading(false); return; }
      // Recent: sort by value descending like Continue watching list
      const recentPaths = entries.sort((a,b)=> b[1]-a[1]).slice(0, 8).map(([p])=>p);
      const statsMap: Record<string, { last14: number; total: number; last?: number; lastPos?: number }>= {};
      let totalMinutes = 0; let last14Total = 0;
      // Limit total processed to 300 items to keep it fast
      const allPaths = entries.map(([p])=>p).slice(0, 300);
      await Promise.all(allPaths.map(async (p)=>{
        try {
          const s = await window.api.getWatchStats(p);
          totalMinutes += Math.round(s.totalMinutes || 0);
          last14Total += Math.round(s.last14Minutes || 0);
          statsMap[p] = { last14: s.last14Minutes||0, total: s.totalMinutes||0, last: s.lastWatched ? new Date(s.lastWatched).getTime() : undefined, lastPos: s.lastPositionSec };
        } catch {}
      }));
      // by extension
      const byExtAgg: Record<string, { count:number; minutes:number }> = {};
      for (const p of allPaths) {
        const name = p.split('\\').pop() || p;
        const ext = (name.split('.').pop() || '').toLowerCase();
        const m = statsMap[p]?.total || 0;
        if (!byExtAgg[ext]) byExtAgg[ext] = { count:0, minutes:0 };
        byExtAgg[ext].count += 1; byExtAgg[ext].minutes += m;
      }
      const byExt = Object.entries(byExtAgg).filter(([k])=>!!k).map(([k,v])=>({ key:k.toUpperCase(), count:v.count, minutes:v.minutes })).sort((a,b)=> b.count - a.count).slice(0,6);
      // by folder (sum minutes)
      const byFolderAgg: Record<string, number> = {};
      for (const p of allPaths) {
        const folder = p.substring(0, Math.max(0, p.lastIndexOf('\\')));
        byFolderAgg[folder] = (byFolderAgg[folder]||0) + (statsMap[p]?.total || 0);
      }
      const byFolder = Object.entries(byFolderAgg).map(([k,v])=>({ key:k, minutes:v })).sort((a,b)=> b.minutes - a.minutes).slice(0,6);
      // fetch meta for paths to compute thumbs and durations
      const pathMeta: Record<string, { duration?: number; thumb?: string | null }> = {};
      await Promise.all(allPaths.map(async (p)=>{
        try {
          const meta = await window.api.getMeta(p);
          pathMeta[p] = { duration: meta?.duration, thumb: meta?.thumb };
        } catch { pathMeta[p] = {}; }
      }));

      // recent thumbs
      const recent: InsightData["recent"] = [];
      for (const p of recentPaths) {
        const name = p.split('\\').pop() || p;
        recent.push({ path: p, name, thumb: pathMeta[p]?.thumb });
      }

      // most watched video
      let mostWatchedVideo: InsightData["mostWatchedVideo"] | undefined = undefined;
      for (const p of allPaths) {
        const minutes = statsMap[p]?.total || 0;
        if (!mostWatchedVideo || minutes > mostWatchedVideo.minutes) {
          mostWatchedVideo = {
            path: p,
            name: p.split('\\').pop() || p,
            minutes,
            thumb: pathMeta[p]?.thumb
          };
        }
      }

      // completed videos (>=95% watched or near end)
      const completedList: InsightData["completed"] = [];
      for (const p of allPaths) {
        const durSec = pathMeta[p]?.duration || 0;
        const totMin = statsMap[p]?.total || 0;
        const totSec = totMin * 60;
        const nearEnd = (statsMap[p]?.lastPos ?? undefined) !== undefined ? ((statsMap[p]!.lastPos! <= 10) && durSec > 0) : false;
        const ratio = durSec > 0 ? (totSec / durSec) : 0;
        const isCompleted = durSec > 0 && (ratio >= 0.95 || nearEnd);
        if (isCompleted) {
          completedList.push({ path: p, name: p.split('\\').pop() || p, thumb: pathMeta[p]?.thumb });
        }
      }
      const completedCount = completedList.length;

      // most watched category (aggregate minutes of videos attributed to a category)
      let mostWatchedCategory: InsightData["mostWatchedCategory"] | undefined = undefined;
      try {
        const cats = await window.api.getCategories();
        const catMinutes: Array<{ id?: string; name: string; minutes: number }> = [];
        for (const c of cats || []) {
          let minutes = 0;
          const items = (c.items || []) as Array<{ type: 'video'|'folder'; path: string }>;
          for (const p of allPaths) {
            const belongs = items.some(it => it.type === 'video' ? it.path === p : p.startsWith(it.path));
            if (belongs) minutes += (statsMap[p]?.total || 0);
          }
          if (minutes > 0) catMinutes.push({ id: (c as any).id, name: (c as any).name, minutes });
        }
        catMinutes.sort((a,b)=> b.minutes - a.minutes);
        if (catMinutes.length) mostWatchedCategory = catMinutes[0];
      } catch {}

      setInsights({ totalMinutes, last14Minutes: last14Total, totalItems: allPaths.length, byExt, byFolder, recent, mostWatchedVideo, mostWatchedCategory, completedCount, completed: completedList.slice(0, 12) });
      try {
        const agg = await window.api.getDailyTotals(30);
        const minutes = agg.seconds.map((s: number) => Math.round(s/60));
        setDailyTotals({ dates: agg.dates, minutes });
      } catch {
        setDailyTotals({ dates: [], minutes: [] });
      }
    } catch {
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'INSIGHTS') buildInsights();
  }, [activeTab, history]);

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
    <div className="min-h-screen bg-steam-bg text-slate-200">
      <style>{`
        .titlebar{-webkit-app-region:drag}
        .no-drag{-webkit-app-region:no-drag}
        .titlebar .is-win-btn{ outline: none; box-shadow: none; }
        .titlebar .is-win-btn:focus{ outline: none; box-shadow: none; }
        .titlebar .is-win-btn:focus-visible{ outline: 2px solid rgba(148,163,184,0.45); outline-offset: 2px; border-radius: 6px; }
      `}</style>
      {/* Custom Title Bar */}
      <div className="titlebar fixed top-0 left-0 right-0 h-8 z-50 bg-gradient-to-r from-[#0e141c] via-[#111827] to-[#0e141c] border-b border-slate-800/80">
        <div className="h-full flex items-center px-2">
          <div className="text-[12px] text-slate-300/90 tracking-wide">Steam-like Player</div>
          <div className="no-drag ml-auto flex items-center gap-1">
            <button onClick={() => window.api.winMinimize?.()} className="is-win-btn w-10 h-8 inline-flex items-center justify-center text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors rounded-md" title="Minimize">
              <FaMinus size={12} />
            </button>
            <button onClick={() => window.api.winToggleMaximize?.()} className="is-win-btn w-10 h-8 inline-flex items-center justify-center text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors rounded-md" title={isMax ? 'Restore' : 'Maximize'}>
              {isMax ? <FaWindowRestore size={12} /> : <FaWindowMaximize size={12} />}
            </button>
            <button onClick={() => window.api.winClose?.()} className="is-win-btn w-12 h-8 inline-flex items-center justify-center text-slate-200 hover:bg-red-600/90 hover:text-white transition-colors rounded-md" title="Close">
              <FaTimes size={12} />
            </button>
          </div>
        </div>
      </div>
  <div className="flex pt-8 min-h-[calc(100vh-2rem)] items-stretch">
        {/* Boot overlay for extra smoothness after splash window */}
        {bootOverlay && (
          <div className="pointer-events-none fixed inset-0 z-40" style={{ background: 'linear-gradient(180deg, rgba(17,24,39,0.85), rgba(17,24,39,0.6))', animation: 'fadeOut 420ms ease forwards' }} />
        )}
        <style>{`@keyframes fadeOut{from{opacity:1}to{opacity:0;visibility:hidden}}`}</style>
      <div
        className={`hidden md:block border-r border-slate-800 min-h-[calc(100vh-2rem)] overflow-hidden transition-all duration-300 ease-in-out`}
        style={{ width: sidebarExpanded ? '18rem' : '0rem', padding: sidebarExpanded ? '1rem' : '0rem', willChange: 'width, padding' }}
      >
        <div
          style={{
            opacity: sidebarContentVisible ? 1 : 0,
            transform: sidebarContentVisible ? 'translateX(0)' : 'translateX(-8px)',
            transition: 'opacity 220ms ease, transform 220ms ease',
            pointerEvents: sidebarContentVisible ? 'auto' : 'none',
            willChange: 'opacity, transform'
          }}
        >
        <div className="flex flex-col gap-2">
          <button onClick={chooseFolder} className="w-full inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">
            <FaFolderOpen /> Choose Folder
          </button>
          <button onClick={testFF} className="w-full inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">Test FFmpeg</button>
        </div>
        <div className="mt-4">
          <CategoryList
            onSelect={async (catId)=>{
              if (activeTab !== 'LIBRARY') {
                setActiveTab('LIBRARY');
                await window.api.setUiPrefs({ categoryView: true });
              }
              setSelectedCategoryId(catId);
              setLibFolderPath(null);
              setLibFolderVideos([]);
              if (!catId) {
                setCategoryItems([]);
                await window.api.setUiPrefs({ selectedCategoryId: null, categoryView: true });
                return;
              }
              const all = await window.api.getCategories();
              const c = all.find((x:any)=>x.id===catId);
              setCategoryItems(c?.items || []);
              await window.api.setUiPrefs({ selectedCategoryId: catId, categoryView: true });
              await hydrateCategoryItems(c?.items || []);
            }}
          />
        </div>
    </div>
    </div>

  <div className="flex-1 flex flex-col min-w-0 min-h-[calc(100vh-2rem)]">
        {/* Top bar / hero */}
        <div className="px-6 pt-4 pb-6 border-b border-slate-800 bg-gradient-to-b from-steam-panel to-transparent">
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              onClick={async ()=>{
                // Clear any pending timers
                try { sidebarAnimTimers.current.forEach(id => window.clearTimeout(id)); sidebarAnimTimers.current = []; } catch {}
                if (sidebarExpanded) {
                  // Collapse sequence: fade content then shrink width
                  setSidebarContentVisible(false);
                  const t = window.setTimeout(() => {
                    setSidebarExpanded(false);
                    (window.api.setUiPrefs as any)({ sidebarOpen: false }).catch(()=>{});
                  }, 230);
                  sidebarAnimTimers.current.push(t);
                } else {
                  // Expand sequence: expand width then fade content in
                  setSidebarExpanded(true);
                  (window.api.setUiPrefs as any)({ sidebarOpen: true }).catch(()=>{});
                  const t = window.setTimeout(() => {
                    setSidebarContentVisible(true);
                  }, 320);
                  sidebarAnimTimers.current.push(t);
                }
              }}
            >
              {sidebarExpanded ? <FaChevronLeft size={14} /> : <FaChevronRight size={14} />}
            </button>
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
          {/* Tabs in hero */}
          <div className="mt-1 flex items-center gap-8 text-sm select-none">
            <button
              className={`px-1 py-1 tracking-wide ${activeTab==='GLOBAL' ? 'text-sky-300 border-b-2 border-sky-400' : 'text-slate-300 hover:text-slate-100'}`}
              onClick={async ()=>{
                setActiveTab('GLOBAL');
                setSelectedCategoryId(null);
                setCategoryItems([]);
                setLibFolderPath(null);
                setLibFolderVideos([]);
                await window.api.setUiPrefs({ categoryView: false, selectedCategoryId: null });
              }}
            >GLOBAL</button>
            <button
              className={`px-1 py-1 tracking-wide ${activeTab==='LIBRARY' ? 'text-sky-300 border-b-2 border-sky-400' : 'text-slate-300 hover:text-slate-100'}`}
              onClick={async ()=>{
                setActiveTab('LIBRARY');
                await window.api.setUiPrefs({ categoryView: true });
              }}
            >LIBRARY</button>
            <button
              className={`px-1 py-1 tracking-wide ${activeTab==='INSIGHTS' ? 'text-sky-300 border-b-2 border-sky-400' : 'text-slate-300 hover:text-slate-100'}`}
              onClick={()=> setActiveTab('INSIGHTS')}
            >INSIGHTS</button>
          </div>
        </div>

  {/* Breadcrumbs (hidden on INSIGHTS) */}
  {activeTab !== 'INSIGHTS' && (
    <>
      <div className="px-6 pt-2 flex items-center gap-2"></div>
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
    </>
  )}

        {/* Search and sort toolbar (lower layout, under breadcrumbs) - visible in LIBRARY */}
        {activeTab==='LIBRARY' && (
          <div className="px-8 pb-2 flex items-center gap-3">
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
          </div>
        )}

        {activeTab==='INSIGHTS' ? (
          <div className="px-8 pb-12 w-full max-w-7xl mx-auto">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl p-5 min-h-[120px] bg-gradient-to-br from-sky-900/40 via-slate-900/50 to-indigo-900/40 border border-slate-800">
                <div className="text-slate-400 text-sm">Total watch time</div>
                <div className="text-3xl font-semibold mt-1">{insightsLoading? '…' : `${Math.floor((insights?.totalMinutes||0)/60)}h ${Math.round((insights?.totalMinutes||0)%60)}m`}</div>
                <div className="text-slate-400 text-xs mt-2">across {insights?.totalItems||0} items</div>
              </div>
              <div className="rounded-xl p-5 min-h-[120px] bg-gradient-to-br from-emerald-900/40 via-slate-900/50 to-cyan-900/40 border border-slate-800">
                <div className="text-slate-400 text-sm">Last 14 days</div>
                <div className="text-3xl font-semibold mt-1">{insightsLoading? '…' : `${Math.floor((insights?.last14Minutes||0)/60)}h ${Math.round((insights?.last14Minutes||0)%60)}m`}</div>
                <div className="text-slate-400 text-xs mt-2">active minutes watched</div>
              </div>
              <div className="rounded-xl p-5 min-h-[120px] bg-gradient-to-br from-fuchsia-900/40 via-slate-900/50 to-purple-900/40 border border-slate-800">
                <div className="text-slate-400 text-sm">Items with progress</div>
                <div className="text-3xl font-semibold mt-1">{insightsLoading? '…' : `${Object.keys(history).length}`}</div>
                <div className="text-slate-400 text-xs mt-2">can resume where you left off</div>
              </div>
              <div className="rounded-xl p-5 min-h-[120px] bg-gradient-to-br from-amber-900/40 via-slate-900/50 to-rose-900/40 border border-slate-800">
                <div className="text-slate-400 text-sm">Most watched video</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-16 h-10 bg-slate-800 overflow-hidden rounded">
                    {insights?.mostWatchedVideo?.thumb ? <img src={insights.mostWatchedVideo.thumb} className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-sm truncate" title={insights?.mostWatchedVideo?.name}>{insights?.mostWatchedVideo?.name || '—'}</div>
                    <div className="text-slate-400 text-xs">{insights?.mostWatchedVideo ? `${Math.round(insights.mostWatchedVideo.minutes)} min` : 'No data'}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl p-5 min-h-[120px] bg-gradient-to-br from-cyan-900/40 via-slate-900/50 to-teal-900/40 border border-slate-800">
                <div className="text-slate-400 text-sm">Most watched category</div>
                <div className="text-2xl font-semibold mt-2 truncate" title={insights?.mostWatchedCategory?.name || ''}>{insights?.mostWatchedCategory?.name || '—'}</div>
                <div className="text-slate-400 text-xs mt-1">{insights?.mostWatchedCategory ? `${Math.round(insights.mostWatchedCategory.minutes)} min` : 'No data'}</div>
              </div>
              <div className="rounded-xl p-5 min-h-[120px] bg-gradient-to-br from-emerald-900/40 via-slate-900/50 to-lime-900/40 border border-slate-800">
                <div className="text-slate-400 text-sm">Completed videos</div>
                <div className="text-3xl font-semibold mt-1">{insightsLoading? '…' : `${insights?.completedCount || 0}`}</div>
                <div className="text-slate-400 text-xs mt-2">watched fully</div>
              </div>
            </div>
            <div className="grid gap-6 mt-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              <div className="rounded-xl p-5 bg-steam-panel border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-slate-200 font-semibold">Daily minutes (30d)</div>
                  <div className="text-slate-400 text-xs">Total: {dailyTotals.minutes.reduce((a,b)=>a+b,0)}m</div>
                </div>
                <Sparkline data={dailyTotals.minutes} labels={dailyTotals.dates} height={64} />
              </div>
              <div className="rounded-xl p-5 bg-steam-panel border border-slate-800">
                <div className="text-slate-200 font-semibold mb-3">Top file types</div>
                <div className="space-y-2">
                  {(insights?.byExt||[]).map((e)=>{
                    const max = Math.max(1, ...((insights?.byExt||[]).map(x=>x.count)));
                    const pct = Math.round((e.count/max)*100);
                    return (
                      <div key={e.key} className="flex items-center gap-3">
                        <div className="w-14 text-slate-300 text-sm">{e.key}</div>
                        <div className="flex-1 h-2 rounded bg-slate-800 overflow-hidden"><div className="h-full bg-gradient-to-r from-sky-500 to-indigo-400" style={{ width: pct+'%' }} /></div>
                        <div className="w-10 text-right text-slate-400 text-sm">{e.count}</div>
                      </div>
                    );
                  })}
                  {(!insights || (insights?.byExt||[]).length===0) && <div className="text-slate-400 text-sm">No data yet</div>}
                </div>
              </div>
              <div className="rounded-xl p-5 bg-steam-panel border border-slate-800">
                <div className="text-slate-200 font-semibold mb-3">Most watched folders</div>
                <div className="space-y-2">
                  {(insights?.byFolder||[]).map((f)=>{
                    const max = Math.max(1, ...((insights?.byFolder||[]).map(x=>x.minutes)));
                    const pct = Math.round((f.minutes/max)*100);
                    const label = f.key.split('\\').pop() || f.key;
                    return (
                      <div key={f.key} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="text-slate-300 text-sm truncate" title={f.key}>{label}</div>
                          <div className="h-2 rounded bg-slate-800 overflow-hidden mt-1"><div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: pct+'%' }} /></div>
                        </div>
                        <div className="w-20 text-right text-slate-400 text-sm">{Math.round(f.minutes)}m</div>
                      </div>
                    );
                  })}
                  {(!insights || (insights?.byFolder||[]).length===0) && <div className="text-slate-400 text-sm">No data yet</div>}
                </div>
              </div>
            </div>
            <div className="mt-6 col-span-full w-full rounded-xl p-5 bg-steam-panel border border-slate-800">
              <div className="text-slate-200 font-semibold mb-3">Recently watched</div>
              <div ref={recentScrollRef} onScroll={handleRecentScroll} className="w-full overflow-x-auto no-scrollbar snap-x snap-mandatory" style={{ maxWidth: 'calc(4 * 280px + 3 * 16px)' }}>
                <div className="flex gap-4 pr-2">
                  {(insights?.recent||[]).map((r)=> (
                    <button
                      key={r.path}
                      onClick={async ()=>{
                        const local = videos.find(v=>v.path===r.path);
                        if (local) { setSelected(local); return; }
                        try {
                          const vi = await window.api.getVideoItem(r.path);
                          if (vi) {
                            try { const meta = await window.api.getMeta(vi.path); Object.assign(vi, meta); } catch {}
                            setSelected(vi);
                          }
                        } catch {}
                      }}
                      className="flex-shrink-0 w-[280px] snap-start rounded-lg bg-steam-card border border-slate-800 text-left overflow-hidden hover:border-slate-600/80 transition-colors"
                    >
                      <div className="aspect-video bg-slate-900/60 overflow-hidden w-full">{r.thumb ? <img src={r.thumb} className="w-full h-full object-cover" alt={r.name} /> : <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">No thumbnail</div>}</div>
                      <div className="p-3 text-sm truncate" title={r.name}>{r.name}</div>
                    </button>
                  ))}
                  {(!insights || (insights?.recent||[]).length===0) && <div className="text-slate-400 text-sm">No watch history yet</div>}
                </div>
              </div>
              {(recentPages > 1) && (
                <div className="mt-2 flex justify-center gap-2">
                  {Array.from({ length: recentPages }).map((_, i) => (
                    <button
                      key={`recent-dot-${i}`}
                      onClick={() => {
                        const el = recentScrollRef.current;
                        if (!el) return;
                        el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
                        setRecentPage(i);
                      }}
                      aria-label={`Go to page ${i + 1}`}
                      className={`h-2 w-2 rounded-full transition-colors ${i === recentPage ? 'bg-slate-300' : 'bg-slate-600/50 hover:bg-slate-500/70'}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 col-span-full w-full rounded-xl p-5 bg-steam-panel border border-slate-800">
              <div className="text-slate-200 font-semibold mb-3">Completed videos</div>
              <div ref={completedScrollRef} onScroll={handleCompletedScroll} className="w-full overflow-x-auto no-scrollbar snap-x snap-mandatory" style={{ maxWidth: 'calc(4 * 280px + 3 * 16px)' }}>
                <div className="flex gap-4 pr-2">
                  {(insights?.completed||[]).map((r)=> (
                    <button
                      key={`completed-${r.path}`}
                      onClick={async ()=>{
                        const local = videos.find(v=>v.path===r.path);
                        if (local) { setSelected(local); return; }
                        try {
                          const vi = await window.api.getVideoItem(r.path);
                          if (vi) {
                            try { const meta = await window.api.getMeta(vi.path); Object.assign(vi, meta); } catch {}
                            setSelected(vi);
                          }
                        } catch {}
                      }}
                      className="flex-shrink-0 w-[280px] snap-start rounded-lg bg-steam-card border border-slate-800 text-left overflow-hidden hover:border-slate-600/80 transition-colors"
                    >
                      <div className="aspect-video bg-slate-900/60 overflow-hidden w-full">{r.thumb ? <img src={r.thumb} className="w-full h-full object-cover" alt={r.name} /> : <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">No thumbnail</div>}</div>
                      <div className="p-3 text-sm truncate" title={r.name}>{r.name}</div>
                    </button>
                  ))}
                  {(!insights || (insights?.completed||[]).length===0) && <div className="text-slate-400 text-sm">No completed videos yet</div>}
                </div>
              </div>
              {(completedPages > 1) && (
                <div className="mt-2 flex justify-center gap-2">
                  {Array.from({ length: completedPages }).map((_, i) => (
                    <button
                      key={`completed-dot-${i}`}
                      onClick={() => {
                        const el = completedScrollRef.current;
                        if (!el) return;
                        el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
                        setCompletedPage(i);
                      }}
                      aria-label={`Go to page ${i + 1}`}
                      className={`h-2 w-2 rounded-full transition-colors ${i === completedPage ? 'bg-slate-300' : 'bg-slate-600/50 hover:bg-slate-500/70'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
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
        )}

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

      {/* Recently Watched (hidden on INSIGHTS) */}
      {activeTab !== 'INSIGHTS' && Object.keys(history).length > 0 && (
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
    </div>
  );
};

const App: React.FC = () => (
  <ToastProvider>
    <Library />
  </ToastProvider>
);

export default App;

// Lightweight sparkline SVG component
const Sparkline: React.FC<{ data: number[]; labels?: string[]; height?: number; stroke?: string }>=({ data, labels, height=48, stroke='url(#sg)' })=>{
  const w = Math.max(120, data.length * 8);
  const h = height;
  const max = Math.max(1, ...data);
  const pts = data.map((v,i)=>{
    const x = (i/(Math.max(1,data.length-1))) * (w-8) + 4;
    const y = h - (v/max) * (h-10) - 5;
    return `${x},${y}`;
  }).join(' ');
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
        <defs>
          <linearGradient id="sg" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={pts} />
        <polyline fill="url(#sg)" opacity="0.08" points={`4,${h-5} ${pts} ${w-4},${h-5}`} />
      </svg>
    </div>
  );
};
