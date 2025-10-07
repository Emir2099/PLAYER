import React, { useEffect, useMemo, useState } from 'react';
import { FaFolderOpen, FaPlay, FaInfoCircle, FaSearch, FaExternalLinkAlt } from 'react-icons/fa';

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

const App: React.FC = () => {
  const [folder, setFolder] = useState<string>('');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [selected, setSelected] = useState<VideoItem | null>(null);
  const [history, setHistory] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const last = await window.api.getLastFolder();
      const base = last && last.length ? last : await window.api.homeDir();
      setFolder(base);
      setHistory(await window.api.getHistory());
      const items = await window.api.scanVideos(base, { recursive: true, depth: 3 });
      setVideos(items);
      for (const v of items.slice(0, 24)) {
        window.api.getMeta(v.path).then(meta => setVideos(prev => prev.map(p => p.path === v.path ? { ...p, ...meta } : p)));
      }
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
      for (const v of items.slice(0, 24)) {
        window.api.getMeta(v.path).then(meta => setVideos(prev => prev.map(p => p.path === v.path ? { ...p, ...meta } : p)));
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 bg-steam-panel border-b border-slate-800">
        <div className="text-xl font-semibold text-slate-100">Steam-like Player</div>
        <button onClick={chooseFolder} className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded bg-steam-card hover:bg-slate-700 text-slate-100">
          <FaFolderOpen /> Choose Folder
        </button>
      </div>

      {/* Search and sort */}
      <div className="px-6 py-4 flex gap-3 items-center bg-transparent">
        <div className="flex items-center gap-2 bg-steam-panel rounded px-3 py-2 w-full max-w-lg">
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
        <div className="text-slate-400 text-sm truncate max-w-[40%]" title={folder}>{folder}</div>
      </div>

      {/* Grid */}
      <div className="px-6 pb-10 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {filtered.map(v => (
          <div key={v.path} className="group rounded-lg overflow-hidden bg-gradient-to-b from-steam-card to-steam-panel border border-slate-800 shadow hover:shadow-xl transition-shadow">
            <div className="aspect-video bg-slate-900/60 overflow-hidden relative">
              {v.thumb ? <img src={v.thumb} alt="thumb" className="w-full h-full object-cover" /> : null}
              {history[v.path] ? <div className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded bg-black/60 border border-white/10">Recently watched</div> : null}
            </div>
            <div className="p-3">
              <div className="font-semibold text-slate-100 truncate" title={v.name}>{v.name}</div>
              <div className="text-xs text-slate-400 mt-1">{v.ext.toUpperCase()} • {formatBytes(v.size)}{typeof v.duration === 'number' ? ` • ${v.duration} s` : ''}</div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSelected(v)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-steam-accent/90 hover:bg-steam-accent text-white text-sm">
                  <FaPlay /> Play
                </button>
                <button onClick={() => window.api.revealInExplorer(v.path)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm">
                  <FaExternalLinkAlt /> Show in Folder
                </button>
                <div className="ml-auto text-slate-500 self-center" title={new Date(v.mtime).toLocaleString()}>
                  <FaInfoCircle />
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-slate-400">No videos found in this folder. Click "Choose Folder" to select another directory.</div>
        )}
      </div>

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
              <video src={fileUrl(selected.path)} controls autoPlay className="w-full max-h-[70vh]" onPlay={() => window.api.markWatched(selected.path)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
