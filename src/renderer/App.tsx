import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

// Completion logic constants
const NEAR_END_MIN_DURATION_SEC = 120; // only treat "<=10s remaining" as complete for videos >= 2 minutes

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

// Standalone Achievement Editor to avoid parent re-renders causing input jank
const AchievementEditor: React.FC<{
  existing?: any;
  onClose: () => void;
  onSaved: () => void;
  libraryCandidates?: string[]; // optional list of video paths to pick from
}> = ({ existing, onClose, onSaved, libraryCandidates }) => {
  // Seed initial state from existing (edit) or defaults (create)
  const [name, setName] = useState(existing?.name || 'New Achievement');
  const [description, setDescription] = useState(existing?.description || '');
  const [icon, setIcon] = useState(existing?.icon || '🏆');
  const [rarity, setRarity] = useState<'common'|'rare'|'epic'|'legendary'>(existing?.rarity || 'common');
  // Badge customization (optional)
  const [badgeEnabled, setBadgeEnabled] = useState(!!existing?.badge);
  const [badgeName, setBadgeName] = useState(existing?.badge?.name || '');
  const [badgeIcon, setBadgeIcon] = useState(existing?.badge?.icon || '');
  // Only first rule supported in UI for now
  const firstRule = (existing?.rules && existing.rules[0]) || {};
  const [metric, setMetric] = useState<'minutes'|'uniqueVideos'|'videosCompleted'|'minutesInWindow'>(firstRule.metric || 'minutes');
  const [operator, setOperator] = useState(firstRule.operator || '>=' as any);
  const [target, setTarget] = useState(firstRule.target ?? 60);
  const [rollingDays, setRollingDays] = useState(firstRule.window?.rollingDays ?? 7);
  const [exts, setExts] = useState((firstRule.filters?.exts || []).join(','));
  // Category multi-select state
  const [selectedCats, setSelectedCats] = useState<string[]>(firstRule.filters?.categories || []);
  const [availableCategories, setAvailableCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catInputRef = useRef<HTMLDivElement | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  // Specific videos filter (exact file paths)
  const [videoPaths, setVideoPaths] = useState<string[]>(firstRule.filters?.videos || []);
  // Library picker state
  const [libPickerOpen, setLibPickerOpen] = useState(false);
  const [libFilter, setLibFilter] = useState('');
  const [libSelected, setLibSelected] = useState<Record<string, boolean>>({});
  const [libMeta, setLibMeta] = useState<Record<string, { name: string; duration?: number; thumb?: string | null; categories: string[] }>>({});
  const [extraCandidates, setExtraCandidates] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<'name'|'duration'>('name');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  const allCandidates = useMemo(() => {
    const base = Array.from(new Set([...(libraryCandidates || []), ...extraCandidates].filter(Boolean)));
    return base;
  }, [libraryCandidates, extraCandidates]);

  // Build rich metadata for library candidates when opening the picker
  useEffect(() => {
    if (!libPickerOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const paths = Array.from(new Set((allCandidates || []).filter(Boolean)));
        // Load categories to compute chips
        let catList: Array<{ id: string; name: string; items: Array<{ type: 'video'|'folder'; path: string }> }> = [];
        try { catList = await window.api.getCategories(); } catch {}
        const catChipsFor = (p: string) => {
          const names: string[] = [];
          for (const c of catList) {
            const inCat = (c.items || []).some(it => it.type==='video' ? it.path === p : p.startsWith(it.path));
            if (inCat) names.push(c.name);
          }
          return names;
        };
        // Seed with names and category chips
        const seed: Record<string, { name: string; duration?: number; thumb?: string | null; categories: string[] }> = {};
        for (const p of paths) {
          const base = p.split('\\').pop() || p.split('/').pop() || p;
          seed[p] = { name: base, categories: catChipsFor(p) };
        }
        if (!cancelled) setLibMeta(prev => ({ ...seed, ...prev }));
        // Fetch metadata in small batches to avoid hammering ffprobe
        const batch = 8;
        for (let i = 0; i < paths.length; i += batch) {
          const slice = paths.slice(i, i + batch);
          const metas = await Promise.all(slice.map(async (p) => {
            try { return { p, meta: await window.api.getMeta(p) }; } catch { return { p, meta: {} as any }; }
          }));
          if (cancelled) return;
          setLibMeta(prev => {
            const next = { ...prev } as typeof prev;
            for (const { p, meta } of metas) {
              const cur = next[p] || { name: p.split('\\').pop() || p, categories: [] };
              next[p] = { ...cur, duration: meta?.duration, thumb: (meta as any)?.thumb };
            }
            return next;
          });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [libPickerOpen, allCandidates]);

  // Fetch categories on mount
  useEffect(() => {
    (async () => {
      try {
        const cats = await window.api.getCategories();
        setAvailableCategories(cats.map((c: any) => ({ id: c.id, name: c.name })));
      } catch {}
    })();
  }, []);

  // Update dropdown position when opened
  useEffect(() => {
    if (catDropdownOpen && catInputRef.current) {
      const rect = catInputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [catDropdownOpen]);

  const save = async () => {
    try {
      const currentDefs = (await window.api.getAchievements()) || [];
      const filters: any = {};
      if (exts.trim()) filters.exts = exts.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (selectedCats.length > 0) filters.categories = selectedCats;
      if (videoPaths.length > 0) filters.videos = videoPaths;
      const rule: any = { metric, operator, target, filters };
      if (metric === 'minutesInWindow') rule.window = { rollingDays };
      if (existing) {
        // Update existing achievement (replace first rule only)
        const updated = currentDefs.map((d: any) => {
          if (d.id !== existing.id) return d;
          const base = { ...d, name, description, icon, rarity, rules: [rule] };
          if (badgeEnabled && (badgeName.trim() || badgeIcon.trim())) {
            (base as any).badge = { name: badgeName.trim() || name, icon: badgeIcon.trim() || icon };
          } else {
            delete (base as any).badge;
          }
          return base;
        });
        await window.api.setAchievements(updated);
      } else {
        const id = (Math.random().toString(36).slice(2)) + Date.now();
        const def: any = { id, name, description, icon, rarity, rules: [rule], notify: true };
        if (badgeEnabled && (badgeName.trim() || badgeIcon.trim())) {
          def.badge = { name: badgeName.trim() || name, icon: badgeIcon.trim() || icon };
        }
        await window.api.setAchievements([...(currentDefs||[]), def]);
      }
      onSaved();
      onClose();
    } catch {}
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-steam-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-base font-semibold text-slate-200">{existing ? 'Edit Achievement' : 'Create Achievement'}</div>
        {existing && (
          <div className="text-[10px] italic text-slate-500">(Only first rule editable – multi-rule editor coming soon)</div>
        )}
      </div>
      {/* Name Row */}
      <div className="mb-4">
        <div className="text-xs text-slate-400 mb-1.5">Name</div>
        <input className="w-full bg-slate-800 rounded-md px-3 h-10 text-sm" value={name} onChange={e=>setName(e.target.value)} />
      </div>

      {/* Icon and Rarity Row */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div className="text-xs text-slate-400 mb-1.5">Icon</div>
          <div className="flex gap-2">
            <input className="flex-1 bg-slate-800 rounded-md px-3 h-10 text-sm" value={icon} onChange={e=>setIcon(e.target.value)} />
            <button
              type="button"
              className="px-4 h-10 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-sm whitespace-nowrap flex-shrink-0"
              onClick={async ()=>{
                try {
                  const sel = await window.api.selectFile?.([{ name: 'Images', extensions: ['png','jpg','jpeg','gif','webp'] }]);
                  if (sel) setIcon(fileUrl(sel));
                } catch {}
              }}
            >Use image…</button>
          </div>
          {/^https?:|^file:|^data:/.test(icon) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <img src={icon} alt="icon" className="h-4 w-4 object-cover rounded" />
              <span className="truncate">{icon}</span>
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-1.5">Rarity</div>
          <select className="w-full bg-slate-800 rounded-md px-3 h-10 text-sm" value={rarity} onChange={e=>setRarity(e.target.value as any)}>
            <option value="common">common</option>
            <option value="rare">rare</option>
            <option value="epic">epic</option>
            <option value="legendary">legendary</option>
          </select>
        </div>
      </div>

      {/* Description Row */}
      <div className="mb-5">
        <div className="text-xs text-slate-400 mb-1.5">Description</div>
        <input className="w-full bg-slate-800 rounded-md px-3 h-10 text-sm" value={description} onChange={e=>setDescription(e.target.value)} />
      </div>

      {/* Badge Section */}
      <div className="mb-6 border border-slate-700/70 rounded-md p-4 bg-slate-900/40">
        <div className="flex items-center gap-3 mb-3">
          <input id="chk-badge" type="checkbox" className="h-4 w-4" checked={badgeEnabled} onChange={e=>setBadgeEnabled(e.target.checked)} />
          <label htmlFor="chk-badge" className="text-sm font-medium text-slate-200">Attach Badge (shown in Completed view)</label>
        </div>
        {badgeEnabled && (
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <div className="text-xs text-slate-400 mb-1.5">Badge Name</div>
              <input className="w-full bg-slate-800 rounded-md px-3 h-10 text-sm" placeholder="Defaults to achievement name" value={badgeName} onChange={e=>setBadgeName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1.5">Badge Icon / Image</div>
              <div className="flex gap-2">
                <input className="flex-1 bg-slate-800 rounded-md px-3 h-10 text-sm" value={badgeIcon} onChange={e=>setBadgeIcon(e.target.value)} placeholder="Emoji or file path" />
                <button
                  type="button"
                  className="px-3 h-10 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs"
                  onClick={async ()=>{ try { const sel = await window.api.selectFile?.([{ name: 'Images', extensions: ['png','jpg','jpeg','gif','webp'] }]); if (sel) setBadgeIcon(fileUrl(sel)); } catch {} }}
                >Image…</button>
              </div>
              {(badgeIcon && /^https?:|^file:|^data:/.test(badgeIcon)) && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <img src={badgeIcon} className="h-5 w-5 object-cover rounded" />
                  <span className="truncate">{badgeIcon}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rule Section */}
      <div className="mt-5 mb-2 text-slate-200 font-semibold">Rule</div>
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div>
          <div className="text-xs text-slate-400 mb-1.5">Metric</div>
          <select className="w-full bg-slate-800 rounded-md px-3 h-10 text-sm" value={metric} onChange={e=>setMetric(e.target.value as any)}>
            <option value="minutes">minutes (total)</option>
            <option value="uniqueVideos">unique videos</option>
            <option value="videosCompleted">videos completed</option>
            <option value="minutesInWindow">minutes in window</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-1.5">Operator</div>
          <select className="w-full bg-slate-800 rounded-md px-3 h-10 text-sm" value={operator} onChange={e=>setOperator(e.target.value as any)}>
            <option value=">=">&gt;=</option>
            <option value="==">==</option>
            <option value="<=">&lt;=</option>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-1.5">Target</div>
          <input type="number" className="w-full bg-slate-800 rounded-md px-3 h-10 text-sm" value={target} onChange={e=>setTarget(parseInt(e.target.value||'0',10))} />
        </div>
        {metric==='minutesInWindow' && (
          <div>
            <div className="text-xs text-slate-400 mb-1.5">Rolling days</div>
            <input type="number" className="w-full bg-slate-800 rounded-md px-3 h-10 text-sm" value={rollingDays} onChange={e=>setRollingDays(parseInt(e.target.value||'7',10))} />
          </div>
        )}
      </div>

      {/* Filters Section */}
      <div className="mt-5 mb-2 text-slate-200 font-semibold">Filters (optional)</div>
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div className="text-xs text-slate-400 mb-1.5">Extensions (comma-separated)</div>
            <input className="w-full bg-slate-800 rounded-md px-3 h-10 text-sm" placeholder="mp4,mkv" value={exts} onChange={e=>setExts(e.target.value)} />
        </div>
        <div className="relative">
          <div className="text-xs text-slate-400 mb-1.5">Categories (select multiple)</div>
          <div
            ref={catInputRef}
            className="w-full bg-slate-800 rounded-md px-3 py-2 text-sm min-h-[40px] cursor-pointer flex flex-wrap gap-1 items-center"
            onClick={() => setCatDropdownOpen(!catDropdownOpen)}
          >
            {selectedCats.length === 0 && <span className="text-slate-500">Select categories...</span>}
            {selectedCats.map(catId => {
              const cat = availableCategories.find(c => c.id === catId || c.name === catId);
              const label = cat?.name || catId;
              return (
                <span key={catId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-700 text-white text-xs">
                  {label}
                  <button
                    type="button"
                    className="hover:text-red-300"
                    onClick={(e) => { e.stopPropagation(); setSelectedCats(prev => prev.filter(c => c !== catId)); }}
                  >×</button>
                </span>
              );
            })}
          </div>
          {catDropdownOpen && createPortal(
            <div
              className="fixed z-[9999] bg-slate-800 border border-slate-700 rounded-md shadow-2xl max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800"
              style={{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px`, width: `${dropdownPos.width}px` }}
            >
              {availableCategories.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-400">No categories available</div>
              )}
              {availableCategories.map(cat => {
                const isSelected = selectedCats.includes(cat.id) || selectedCats.includes(cat.name);
                return (
                  <div
                    key={cat.id}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-700 ${isSelected ? 'bg-slate-700 text-sky-300' : 'text-slate-200'}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedCats(prev => prev.filter(c => c !== cat.id && c !== cat.name));
                      } else {
                        setSelectedCats(prev => [...prev, cat.id]);
                      }
                    }}
                  >
                    <span className="mr-2">{isSelected ? '✓' : ' '}</span>
                    {cat.name}
                  </div>
                );
              })}
            </div>,
            document.body
          )}
        </div>
        {/* Specific videos selector */}
        <div className="col-span-full">
          <div className="text-xs text-slate-400 mb-1.5">Specific videos (exact matches)</div>
          <div className="rounded-md border border-slate-700 bg-slate-900/40 p-3">
            {videoPaths.length === 0 ? (
              <div className="text-xs text-slate-500 mb-2">No videos selected. Add one or paste a path below.</div>
            ) : (
              <div className="max-h-32 overflow-auto mb-2 space-y-1">
                {videoPaths.map((p, idx) => (
                  <div key={p+idx} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="truncate flex-1" title={p}>{p}</span>
                    <button type="button" className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-[11px]" onClick={()=> setVideoPaths(prev => prev.filter((_,i)=> i!==idx))}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-center">
              <input
                className="flex-1 bg-slate-800 rounded-md px-3 h-9 text-xs"
                placeholder="Paste file path and press Add"
                onKeyDown={(e)=>{
                  const el = e.currentTarget as HTMLInputElement;
                  if (e.key === 'Enter') {
                    const val = el.value.trim();
                    if (val && !videoPaths.includes(val)) setVideoPaths(prev => [...prev, val]);
                    el.value = '';
                  }
                }}
              />
              <button
                type="button"
                className="px-3 h-9 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs"
                onClick={async ()=>{
                  try {
                    const picked = await window.api.selectFiles?.([{ name: 'Videos', extensions: ['mp4','mkv','avi','mov','wmv','webm','flv','m4v','ts','mts','m2ts'] }]);
                    const arr = (picked || []).filter(Boolean);
                    if (arr.length) setVideoPaths(prev => [...prev, ...arr.filter(p => !prev.includes(p))]);
                  } catch {}
                }}
              >Add from disk…</button>
              <button
                type="button"
                disabled={!libraryCandidates || libraryCandidates.length===0}
                className={`px-3 h-9 rounded-md ${(!libraryCandidates || libraryCandidates.length===0)?'bg-slate-800 text-slate-400 cursor-not-allowed':'bg-slate-700 hover:bg-slate-600 text-white'} text-xs`}
                onClick={()=> setLibPickerOpen(true)}
              >Add from library…</button>
            </div>
          </div>
        </div>
      </div>

      {/* Library picker modal */}
      {libPickerOpen && createPortal(
        <div className="fixed inset-0 z-[1600] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={()=> setLibPickerOpen(false)}>
          <div className="w-full max-w-4xl rounded-xl border border-slate-700 bg-steam-card p-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-slate-200 font-semibold text-sm">Pick from library</div>
              <button className="text-slate-300 hover:text-white" onClick={()=> setLibPickerOpen(false)}>×</button>
            </div>
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <input
                className="flex-1 bg-slate-800 rounded-md px-3 h-9 text-sm"
                placeholder="Filter by path or name"
                value={libFilter}
                onChange={e=> setLibFilter(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Sort</label>
                <select className="bg-slate-800 rounded px-2 h-9 text-xs text-slate-200" value={sortKey} onChange={e=> setSortKey(e.target.value as any)}>
                  <option value="name">Name</option>
                  <option value="duration">Duration</option>
                </select>
                <button
                  type="button"
                  className="px-2 h-9 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs"
                  onClick={()=> setSortDir(d => d==='asc'?'desc':'asc')}
                  title="Toggle sort direction"
                >{sortDir==='asc' ? 'Asc' : 'Desc'}</button>
              </div>
              <button
                className="px-2 h-9 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs"
                onClick={async ()=>{
                  try {
                    const dir = await window.api.selectFolder();
                    if (!dir) return;
                    const items = await window.api.scanVideos(dir, { recursive: true, depth: 5 });
                    const paths = (items||[]).map((it:any)=> it.path).filter(Boolean);
                    if (paths.length) setExtraCandidates(prev => Array.from(new Set([...prev, ...paths])));
                  } catch {}
                }}
              >Load from folder…</button>
              <button
                className="px-2 h-9 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs"
                onClick={()=>{
                  const list = (allCandidates||[]).filter(p => {
                    const f = libFilter.trim().toLowerCase();
                    if (!f) return true;
                    const info = libMeta[p];
                    return p.toLowerCase().includes(f) || (info?.name||'').toLowerCase().includes(f);
                  });
                  const map: Record<string, boolean> = {};
                  for (const p of list) map[p] = true;
                  setLibSelected(map);
                }}
              >Select all</button>
              <button
                className="px-2 h-9 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs"
                onClick={()=> setLibSelected({})}
              >None</button>
              <button
                className="px-3 h-9 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs"
                onClick={()=>{
                  const selected = Object.keys(libSelected).filter(p => libSelected[p]);
                  if (selected.length) setVideoPaths(prev => [...prev, ...selected.filter(p => !prev.includes(p))]);
                  setLibPickerOpen(false);
                  setLibFilter('');
                  setLibSelected({});
                }}
              >Add selected</button>
            </div>
            <div className="h-96 overflow-auto rounded border border-slate-700 bg-slate-900/30">
              {(allCandidates||[])
                .filter(p => {
                  const f = libFilter.trim().toLowerCase();
                  if (!f) return true;
                  const info = libMeta[p];
                  return p.toLowerCase().includes(f) || (info?.name||'').toLowerCase().includes(f);
                })
                .sort((a,b)=>{
                  const ia = libMeta[a];
                  const ib = libMeta[b];
                  let cmp = 0;
                  if (sortKey === 'name') {
                    const na = (ia?.name || a).toLowerCase();
                    const nb = (ib?.name || b).toLowerCase();
                    cmp = na.localeCompare(nb);
                  } else {
                    const da = Number.isFinite(ia?.duration as any) ? (ia?.duration as number) : Number.POSITIVE_INFINITY;
                    const db = Number.isFinite(ib?.duration as any) ? (ib?.duration as number) : Number.POSITIVE_INFINITY;
                    cmp = da - db;
                  }
                  return sortDir==='asc' ? cmp : -cmp;
                })
                .map((p) => {
                  const info = libMeta[p];
                  const name = info?.name || (p.split('\\').pop() || p.split('/').pop() || p);
                  const dur = info?.duration;
                  const durationText = dur && Number.isFinite(dur) ? `${Math.floor(dur/60)}:${(dur%60).toString().padStart(2,'0')}` : '';
                  const thumb = info?.thumb || undefined;
                  const cats = info?.categories || [];
                  return (
                    <label key={p} className="grid items-center gap-3 px-3 py-2 text-sm text-slate-200 border-b border-slate-800/60 hover:bg-slate-800/40" style={{ gridTemplateColumns: 'auto 64px 1fr auto' }}>
                      <input type="checkbox" className="h-4 w-4" checked={!!libSelected[p]} onChange={(e)=> setLibSelected(s => ({ ...s, [p]: e.target.checked }))} />
                      <div className="h-12 w-16 bg-slate-800 ring-1 ring-slate-700 rounded overflow-hidden flex items-center justify-center">
                        {thumb ? (<img src={thumb} className="h-full w-full object-cover" />) : (<span className="text-[10px] text-slate-500">No preview</span>)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-slate-100 truncate" title={name}>{name}</div>
                        <div className="text-slate-400 text-[11px] truncate" title={p}>{p}</div>
                        {cats.length>0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {cats.slice(0,4).map(cn => (
                              <span key={cn} className="px-1.5 py-0.5 rounded bg-slate-700/70 text-[10px] text-slate-200">{cn}</span>
                            ))}
                            {cats.length>4 && <span className="px-1.5 py-0.5 rounded bg-slate-700/70 text-[10px] text-slate-300">+{cats.length-4}</span>}
                          </div>
                        )}
                      </div>
                      <div className="ml-auto text-xs text-slate-300 tabular-nums">{durationText}</div>
                    </label>
                  );
                })}
              {(!allCandidates || allCandidates.length===0) && (
                <div className="p-4 text-sm text-slate-400">No library videos available to pick.</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Action Buttons */}
      <div className="mt-6 flex gap-3">
        <button onClick={() => { setCatDropdownOpen(false); save(); }} className="px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-sm">{existing ? 'Update' : 'Save'}</button>
        <button onClick={() => { setCatDropdownOpen(false); onClose(); }} className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-sm">Cancel</button>
      </div>
      {/* Click outside to close dropdown */}
      {catDropdownOpen && createPortal(
        <div className="fixed inset-0 z-[9998]" onClick={() => setCatDropdownOpen(false)} />,
        document.body
      )}
    </div>
  );
};

const Library: React.FC = () => {
  const [isMax, setIsMax] = useState(false);
  const [folder, setFolder] = useState<string>('');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [folders, setFolders] = useState<Array<{ path: string; name: string; mtime: number }>>([]);
  const [folderCovers, setFolderCovers] = useState<Record<string, string>>({});
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [itemMenu, setItemMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [playerMenu, setPlayerMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<VideoItem | null>(null);
  const [history, setHistory] = useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [categories] = useState<string[]>(['All', 'Movies', 'Clips', 'Series']);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const { show, update, close } = useToast();
  const [hoverPayload, setHoverPayload] = useState<{ title: string; thumb?: string | null; lines: string[]; path?: string; lastPositionSec?: number } | null>(null);
  const [appSettings, setAppSettings] = useState<{ enableHoverPreviews: boolean; enableScrubPreview?: boolean; enableAutoplayNext?: boolean; autoplayCountdownSec?: number }>({ enableHoverPreviews: true, enableScrubPreview: true, enableAutoplayNext: true, autoplayCountdownSec: 5 });
  
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
          
  const [categoryItems, setCategoryItems] = useState<Array<{ type: 'video' | 'folder'; path: string }>>([]);
  const [categoryVideoMap, setCategoryVideoMap] = useState<Record<string, VideoItem>>({});
  const [categoryFolderMap, setCategoryFolderMap] = useState<Record<string, { path: string; name: string; mtime: number }>>({});
  const [libFolderPath, setLibFolderPath] = useState<string | null>(null);
  const [libFolderVideos, setLibFolderVideos] = useState<VideoItem[]>([]);
  const [categoryCovers, setCategoryCovers] = useState<Record<string, string>>({});
  const [categoryMenu, setCategoryMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [allCategories, setAllCategories] = useState<Array<{ id: string; name: string; items: Array<{ type: 'video' | 'folder'; path: string }> }>>([]);
          
  const [showTabSwitcher, setShowTabSwitcher] = useState(false);
  // Sidebar animation: expanded controls width; contentVisible controls fade
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sidebarContentVisible, setSidebarContentVisible] = useState(true);
  const sidebarAnimTimers = useRef<number[]>([]);
  // INSIGHTS carousels (pagination & scroll)
  const recentScrollRef = useRef<HTMLDivElement | null>(null);
  const completedScrollRef = useRef<HTMLDivElement | null>(null);
  const [recentPage, setRecentPage] = useState(0);
  const [completedPage, setCompletedPage] = useState(0);
  const [completedPages, setCompletedPages] = useState(0);
  // Missing UI state restored
  const [recentPages, setRecentPages] = useState(0);
  const [activeTab, setActiveTab] = useState<'GLOBAL'|'LIBRARY'|'INSIGHTS'|'ACHIEVEMENTS'>('GLOBAL');
  const [sort, setSort] = useState<SortKey>('recent');
  const [bootOverlay, setBootOverlay] = useState(true);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverDelayRef = useRef<number | null>(null);
  const watchTimerRef = useRef<{ path: string; lastTick: number } | null>(null);
  const posSaveTickRef = useRef<number>(0);
  // Tracks fully completed videos (>=95% watched OR <=10s remaining)
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  // Cache the highest known lastPositionSec per path to avoid regressions when rewatching
  const lastPosRef = useRef<Record<string, number>>({});
  // Manual completion overrides (session-level). Values: 'watched' | 'unwatched'
  const [completionOverride, setCompletionOverride] = useState<Record<string, 'watched' | 'unwatched'>>({});

  // Utility to compute watched flag with overrides first
  const isWatched = (path: string) => {
    const o = completionOverride[path];
    if (o === 'watched') return true;
    if (o === 'unwatched') return false;
    return !!completedMap[path];
  };

  // Helper: only increase last position; never decrease
  const setLastPositionMax = async (path: string, pos: number | undefined) => {
    try {
      if (!Number.isFinite(pos as number)) return;
      const p = path;
      const incoming = Math.max(0, Math.floor(pos as number));
      const cached = lastPosRef.current[p];
      if (typeof cached === 'number' && incoming <= cached) return; // nothing to do
      // If we don't have a cache, peek current to avoid lowering
      let base = cached;
      if (base === undefined) {
        try { const s = await window.api.getWatchStats(p); if (typeof s?.lastPositionSec === 'number') base = s.lastPositionSec; } catch {}
      }
      const next = Math.max(0, typeof base === 'number' ? Math.max(base, incoming) : incoming);
      await window.api.setLastPosition(p, next).catch(()=>{});
      lastPosRef.current[p] = next;
    } catch {}
  };

  const recomputeCompletion = async (path: string, durationHint?: number, statsHint?: { totalMinutes?: number; lastPositionSec?: number }) => {
    try {
      const meta = (typeof durationHint === 'number') ? { duration: durationHint } : await window.api.getMeta(path).catch(()=>({})) || {};
      const durSec = (meta as any)?.duration || 0;
      if (!durSec || !Number.isFinite(durSec)) { return; }
  const fetchedStats = await window.api.getWatchStats(path).catch(() => ({}));
  const stats = (statsHint ?? fetchedStats ?? {}) as any;
      const totSec = Math.round((stats.totalMinutes || 0) * 60);
      const lastPos = stats.lastPositionSec;
      const remaining = (typeof lastPos === 'number') ? Math.max(0, durSec - lastPos) : undefined;
      const ratio = durSec > 0 ? (totSec / durSec) : 0;
      // Only allow the "<=10s remaining" shortcut for longer videos to avoid false positives on short clips
      const allowNearEnd = durSec >= NEAR_END_MIN_DURATION_SEC;
      const nearEnd = allowNearEnd && (remaining !== undefined && remaining <= 10);
      const completed = durSec > 0 && (ratio >= 0.95 || nearEnd);
      setCompletedMap(prev => {
        const forced = completionOverride[path];
        if (forced === 'unwatched') {
          return prev[path] === false ? prev : { ...prev, [path]: false };
        }
        const sticky = prev[path] ? true : completed; // once true, stay true (unless forced unwatched)
        return (prev[path] === sticky) ? prev : { ...prev, [path]: sticky };
      });
      // Keep local last-position cache updated with the max we've seen
      if (typeof lastPos === 'number') {
        const cur = lastPosRef.current[path];
        if (cur === undefined || lastPos > cur) lastPosRef.current[path] = lastPos;
      }
    } catch {}
  };

  // Manual progress controls
  const markAsWatched = async (path: string) => {
    try {
      setCompletionOverride(prev => ({ ...prev, [path]: 'watched' }));
      setCompletedMap(prev => ({ ...prev, [path]: true }));
      try {
        const meta = await window.api.getMeta(path);
        if (meta?.duration && Number.isFinite(meta.duration)) {
          await window.api.setLastPosition(path, meta.duration).catch(()=>{});
          lastPosRef.current[path] = meta.duration!;
        }
      } catch {}
      setInsightsDirty(true);
      await refreshHistory();
      await recomputeCompletion(path).catch(()=>{});
    } catch {}
  };

  const markAsUnwatched = async (path: string) => {
    try {
      setCompletionOverride(prev => ({ ...prev, [path]: 'unwatched' }));
      setCompletedMap(prev => ({ ...prev, [path]: false }));
      try { await window.api.setLastPosition(path, 0).catch(()=>{}); lastPosRef.current[path] = 0; } catch {}
      setInsightsDirty(true);
      await refreshHistory();
      await recomputeCompletion(path).catch(()=>{});
    } catch {}
  };

  const resetProgress = async (path: string) => {
    // Reset behaves like unwatched plus clears resume position
    await markAsUnwatched(path);
  };

// --- Achievements minimal list ---
            
  const [defs, setDefs] = useState<Array<{ id: string; name: string; description?: string; icon?: string; rarity?: string; badge?: { name?: string; icon?: string } }>>([]);
  const [state, setState] = useState<Record<string, { unlockedAt?: string; progress?: { current: number; target: number } }>>({});
  useEffect(() => {
    (async () => {
      try { setDefs(await window.api.getAchievements()); } catch {}
      try { setState(await window.api.getAchievementState()); } catch {}
    })();
  }, []);


const AchievementList: React.FC<{
  onEdit: (id: string)=>void;
  onDelete: (id: string)=>void;
  mode: 'completed'|'remaining'|'all';
  manage?: boolean;
}> = ({ onEdit, onDelete, mode, manage }) => {
  const filteredDefs = defs.filter(d => {
    const st = state[d.id] || {};
    const unlocked = !!st.unlockedAt;
    if (mode === 'completed') return unlocked;
    if (mode === 'remaining') return !unlocked;
    return true; // all
  });
  // Dynamic grid layout: completed uses 2 columns (room for badge panel), remaining & manage use up to 3
  const gridBase = 'grid gap-6 mx-auto w-full';
  const gridCols = mode==='completed' ? 'grid-cols-1 md:grid-cols-2 max-w-5xl' : (mode==='remaining' || manage) ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 max-w-7xl' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl';
  return (
    <div className={`${gridBase} ${gridCols}`}>
      {filteredDefs.length === 0 && (
        <div className="text-slate-400 text-sm">
          {mode==='completed' ? 'No achievements completed yet.' : mode==='remaining' ? 'Nothing left – all achievements unlocked!' : 'No achievements yet. Use Create to add one.'}
        </div>
      )}
      {filteredDefs.map((d) => {
        const st = state[d.id] || {};
        const unlocked = !!st.unlockedAt;
        const progress = st.progress;
        return (
          <div key={d.id} className={`rounded-lg border ${unlocked? 'border-emerald-700/40 bg-gradient-to-br from-emerald-900/30 via-slate-900/40 to-emerald-900/10' : 'border-slate-800 bg-steam-card'} p-3 group`}>            
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-slate-800 flex items-center justify-center overflow-hidden ring-1 ring-slate-700">
                {d.icon && (/^https?:|^file:|^data:/.test(d.icon)) ? (
                  <img src={d.icon} alt="" className="h-4 w-4 object-cover" />
                ) : (
                  <span className="text-lg">{d.icon || '🏆'}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-slate-200 font-medium truncate" title={d.name}>{d.name}</div>
                <div className="text-slate-400 text-xs truncate" title={d.description}>{d.description}</div>
              </div>
              <div className={`ml-auto text-xs px-2 py-0.5 rounded ${d.rarity==='legendary'?'bg-orange-600/30 text-orange-300': d.rarity==='epic'?'bg-purple-600/30 text-purple-300': d.rarity==='rare'?'bg-sky-600/30 text-sky-300':'bg-slate-600/30 text-slate-300'}`}>
                {d.rarity || 'common'}
              </div>
            </div>
            <div className="mt-3 min-h-[32px]">
              {unlocked ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Unlocked
                </div>
              ) : progress ? (
                <>
                  <div className="h-2 rounded bg-slate-800 overflow-hidden"><div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.min(100, Math.round((progress.current!/Math.max(1, progress.target!))*100))}%` }} /></div>
                  <div className="mt-1 text-xs text-slate-400">{progress.current}/{progress.target}</div>
                </>
              ) : (
                <div className="text-xs text-slate-500">Progress not available yet</div>
              )}
            </div>
            {manage && (
              <div className="mt-2 flex gap-2 justify-end opacity-80 group-hover:opacity-100 transition-opacity">
                <button onClick={()=>onEdit(d.id)} className="text-[11px] px-2 py-1 rounded bg-slate-700/50 hover:bg-slate-600 text-slate-200">Edit</button>
                <button onClick={()=>onDelete(d.id)} className="text-[11px] px-2 py-1 rounded bg-rose-700/40 hover:bg-rose-600/60 text-rose-200">Delete</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Badge grid for completed achievements (standalone, outside navigateTo for scope)
function BadgeGrid() {
  const earned = defs.filter(d => state[d.id]?.unlockedAt && (d as any).badge);
  if (!earned.length) return <div className="text-slate-500 text-sm">No badges earned yet.</div>;
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
      {earned.map(d => {
        const b: any = (d as any).badge || {};
        return (
          <div key={d.id} className="relative rounded-lg border border-slate-700 bg-slate-900/50 p-3 flex flex-col items-center text-center hover:border-slate-600/80 transition-colors">
            <div className="h-14 w-14 rounded-md bg-slate-800 flex items-center justify-center overflow-hidden mb-2 ring-1 ring-slate-600">
              {b.icon && (/^https?:|^file:|^data:/.test(b.icon)) ? (
                <img src={b.icon} className="h-8 w-8 object-cover" />
              ) : (
                <span className="text-3xl leading-none">{b.icon || '🎖️'}</span>
              )}
            </div>
            <div className="text-[11px] font-medium text-slate-200 truncate w-full" title={b.name || d.name}>{b.name || d.name}</div>
            <div className="mt-1 text-[10px] text-slate-500 truncate w-full" title={d.name}>{d.name}</div>
          </div>
        );
      })}
    </div>
  );
}

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
        // Load any persisted manual overrides
        const overrides = (prefs as any).completionOverrides;
        if (overrides && typeof overrides === 'object') {
          setCompletionOverride(overrides as Record<string, 'watched'|'unwatched'>);
        }
      } catch {}
      const hist = await window.api.getHistory();
      setHistory(hist);
      // Preload Insights while splash is visible
      try { buildInsights(hist); } catch {}
      try { setFolderCovers(await window.api.getFolderCovers()); } catch {}
      try { setCategoryCovers(await window.api.getCategoryCovers()); } catch {}
  try { const s = await window.api.getAppSettings(); setAppSettings({ enableHoverPreviews: !!s.enableHoverPreviews, enableScrubPreview: s.enableScrubPreview !== false, enableAutoplayNext: s.enableAutoplayNext !== false, autoplayCountdownSec: (typeof s.autoplayCountdownSec==='number' ? Math.min(10, Math.max(3, Math.round(s.autoplayCountdownSec))) : 5) }); } catch {}
      await navigateTo(base);
      // After initial data is ready, fade out boot overlay
      setTimeout(() => setBootOverlay(false), 300);
    })();
  }, []);

  // Keyboard shortcut: Ctrl+, to open Settings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      try {
        if (e.ctrlKey && e.key === ',') {
          e.preventDefault();
          setShowSettings(true);
        }
      } catch {}
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
  const [insightsDirty, setInsightsDirty] = useState(true);
  const [dailyTotals, setDailyTotals] = useState<{ dates: string[]; minutes: number[] }>({ dates: [], minutes: [] });
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [achievementView, setAchievementView] = useState<'completed'|'remaining'|'manage'>('completed');
  // Video fullscreen management (use wrapper fullscreen instead of native video fullscreen)
  const videoWrapRef = useRef<HTMLDivElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  const [videoControlsVisible, setVideoControlsVisible] = useState(true);
  const [videoPaused, setVideoPaused] = useState(false);
  const controlsTimerRef = useRef<number | null>(null);

  // Scrub preview thumbnail (hover over progress area)
  const PREVIEW_STEP_SEC = 2; // quantize requests to reduce seeks
  const PREVIEW_WIDTH = 220; // px
  const PREVIEW_BAND_PX = 90; // only show when mouse is within this many px from bottom of player area
  const [previewState, setPreviewState] = useState<{ visible: boolean; x: number; timeSec: number; url?: string; loading: boolean }>({ visible: false, x: 0, timeSec: 0, url: undefined, loading: false });
  const previewVideoElRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasElRef = useRef<HTMLCanvasElement | null>(null);
  const previewCacheRef = useRef<Map<number, string>>(new Map());
  const previewSrcRef = useRef<string | null>(null);
  const previewSeekBusyRef = useRef<boolean>(false);
  const lastPreviewBinRef = useRef<number | null>(null);
  useEffect(() => {
    const onFs = () => {
      const isFs = !!(document.fullscreenElement && videoWrapRef.current && document.fullscreenElement === videoWrapRef.current);
      setPlayerFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  // Reset scrub preview cache when selection changes
  useEffect(() => {
    previewCacheRef.current.clear();
    lastPreviewBinRef.current = null;
    const v = previewVideoElRef.current;
    if (v) { try { v.src = ''; } catch {} }
    previewSrcRef.current = null;
    setPreviewState(p => ({ ...p, visible: false, url: undefined }));
  }, [selected?.path]);
  // Ensure native fullscreen button is disabled on the video element
  useEffect(() => {
    const el = videoElRef.current;
    if (!el) return;
    try { (el as any).setAttribute('controlsList', 'nofullscreen'); } catch {}
    // Reset controls visibility for a new selection
    try { el.controls = false; setVideoControlsVisible(true); } catch {}
  }, [selected]);

  const updateControlsVisibility = (visible: boolean) => {
    setVideoControlsVisible(visible);
    // Keep native controls disabled; we render our own
    const el = videoElRef.current; if (!el) return;
    try { el.controls = false; } catch {}
  };

  const clearControlsTimer = () => { if (controlsTimerRef.current) { window.clearTimeout(controlsTimerRef.current); controlsTimerRef.current = null; } };

  const scheduleHideControls = (delay = 1800) => {
    if (videoPaused) return; // keep visible when paused
    clearControlsTimer();
    controlsTimerRef.current = window.setTimeout(() => { updateControlsVisibility(false); }, delay);
  };
  const onSeekBarMouse = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const el = e.currentTarget; const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const frac = rect.width > 0 ? x / rect.width : 0;
    const v = videoElRef.current; if (!v) return;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return;
    const t = Math.max(0, Math.min(durationSec, frac * durationSec));
    v.currentTime = t; setCurrentTimeSec(t);
  };
  // Custom controls state & helpers
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [seeking, setSeeking] = useState(false);
  const [seekBarHovering, setSeekBarHovering] = useState(false);
  const fmt = (s?: number) => formatDuration(typeof s === 'number' && Number.isFinite(s) ? s : undefined) || '0:00';
  const progressFrac = durationSec > 0 ? Math.min(1, Math.max(0, currentTimeSec / durationSec)) : 0;
  const bufferedFrac = (()=>{
    try {
      const v = videoElRef.current; if (!v || v.buffered.length === 0 || !Number.isFinite(durationSec) || durationSec<=0) return 0;
      const end = v.buffered.end(v.buffered.length-1);
      return Math.min(1, Math.max(0, end / durationSec));
    } catch { return 0; }
  })();
  const seekToFrac = (frac: number) => {
    const v = videoElRef.current; if (!v || !Number.isFinite(durationSec) || durationSec<=0) return;
    const t = Math.max(0, Math.min(durationSec, frac * durationSec));
    v.currentTime = t; setCurrentTimeSec(t);
  };
  const ensurePreviewForTime = async (timeSec: number): Promise<string | undefined> => {
    try {
      const sel = selected; const vdur = videoElRef.current?.duration;
      if (!sel || !vdur || !Number.isFinite(vdur)) return undefined;
      const src = fileUrl(sel.path);
      const bin = Math.max(0, Math.min(vdur - 0.01, Math.floor(timeSec / PREVIEW_STEP_SEC) * PREVIEW_STEP_SEC));
      const cached = previewCacheRef.current.get(bin);
      if (cached) return cached;
      if (previewSeekBusyRef.current) return undefined;
      previewSeekBusyRef.current = true;
      let pv = previewVideoElRef.current;
      if (!pv) {
        pv = document.createElement('video');
        pv.muted = true; pv.preload = 'auto'; pv.crossOrigin = 'anonymous';
        previewVideoElRef.current = pv;
      }
      if (previewSrcRef.current !== src) {
        pv.src = src; previewSrcRef.current = src;
        await new Promise<void>((res) => {
          const onMeta = () => { pv?.removeEventListener('loadedmetadata', onMeta); res(); };
          pv.addEventListener('loadedmetadata', onMeta);
        });
      }
      // Seek to bin
      await new Promise<void>((res) => {
        const onSeeked = () => { pv?.removeEventListener('seeked', onSeeked); res(); };
        pv.currentTime = bin;
        pv.addEventListener('seeked', onSeeked);
      });
      // Draw frame
      let canvas = previewCanvasElRef.current;
      if (!canvas) { canvas = document.createElement('canvas'); previewCanvasElRef.current = canvas; }
      const vw = pv.videoWidth || 320; const vh = pv.videoHeight || 180;
      const targetW = PREVIEW_WIDTH; const targetH = Math.max(1, Math.round((vh / vw) * targetW));
      canvas.width = targetW; canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(pv, 0, 0, targetW, targetH);
        const url = canvas.toDataURL('image/jpeg', 0.75);
        previewCacheRef.current.set(bin, url);
        return url;
      }
    } catch {}
    finally {
      previewSeekBusyRef.current = false;
    }
    return undefined;
  };
  const refreshHistory = async () => {
    try { const h = await window.api.getHistory(); setHistory(h || {}); } catch {}
  };

  const flushPlaybackProgress = async (reason: 'pause'|'ended'|'close'|'unmount') => {
    try {
      const t = watchTimerRef.current;
      if (!t) return;
      // Flush any accumulated batch
      if (watchAccumRef.current && watchAccumRef.current.path === t.path) {
        const extra = Math.floor(watchAccumRef.current.accumulated);
        if (extra > 0) { await window.api.addWatchTime(t.path, extra).catch(()=>{}); setInsightsDirty(true); }
        watchAccumRef.current = null;
      }
      // Add time since last tick
      const sec = Math.round((Date.now() - t.lastTick) / 1000);
      if (sec > 0) { await window.api.addWatchTime(t.path, sec).catch(()=>{}); setInsightsDirty(true); }
      // Save last known position (or duration if ended)
      const v = videoElRef.current;
      if (v) {
        if (reason === 'ended' && Number.isFinite(v.duration)) {
          await window.api.setLastPosition(t.path, v.duration).catch(()=>{});
        } else if (Number.isFinite(v.currentTime)) {
          await window.api.setLastPosition(t.path, v.currentTime).catch(()=>{});
        }
      }
      watchTimerRef.current = null;
      setVideoPaused(true);
      updateControlsVisibility(true);
      try { recomputeCompletion(t.path, v && Number.isFinite(v.duration) ? v.duration : undefined, { totalMinutes: undefined, lastPositionSec: v && Number.isFinite(v.currentTime) ? v.currentTime : undefined }).catch(()=>{}); } catch {}
      refreshHistory();
      // If ended, consider Next Up autoplay
  if (reason === 'ended' && appSettings.enableAutoplayNext !== false) {
        try {
          // Determine context list (category folder videos, category items videos, or filtered list)
          const currentPath = t.path;
          const currentList: VideoItem[] = (() => {
            if (activeTab === 'LIBRARY') {
              if (libFolderPath) return libFolderVideos;
              if (selectedCategoryId) {
                const vids: VideoItem[] = [];
                for (const it of categoryItems) {
                  if (it.type === 'video') {
                    const v = videos.find(x=>x.path===it.path) || categoryVideoMap[it.path];
                    if (v) vids.push(v);
                  }
                }
                return vids;
              }
            }
            return filtered;
          })();
          const idx = currentList.findIndex(v => v.path === currentPath);
          if (idx >= 0 && idx < currentList.length - 1) {
            const next = currentList[idx + 1];
            // Countdown toast with cancel and Play now action
            let cancelled = false;
            let remaining = (typeof appSettings.autoplayCountdownSec === 'number' ? Math.min(10, Math.max(3, Math.round(appSettings.autoplayCountdownSec))) : 5);
            const playNow = () => {
              if (cancelled) return;
              cancelled = true;
              try { close?.(toastId); } catch {}
              setSelected(next);
            };
            const onCancel = () => { cancelled = true; try { close?.(toastId); } catch {} };
            const toastId = show(`Next up: ${next.name} in ${remaining}s`, {
              type: 'info',
              timeout: 6000,
              actions: [
                { label: 'Play now', onClick: playNow, primary: true },
                { label: 'Cancel', onClick: onCancel }
              ],
              onClick: onCancel,
              loading: true,
            }) as unknown as number;
            const timer = window.setInterval(() => {
              remaining -= 1;
              update?.(toastId, { message: `Next up: ${next.name} in ${Math.max(0, remaining)}s` } as any);
              if (remaining <= 0) {
                window.clearInterval(timer);
                if (!cancelled) playNow();
              }
            }, 1000);
          }
        } catch {}
      }
    } catch {}
  };

  const handleDeleteAchievement = async (id: string) => {
    try {
      const ok = window.confirm ? window.confirm('Delete this achievement?') : true;
      if (!ok) return;
      const current = (await window.api.getAchievements()) || [];
      await window.api.setAchievements(current.filter((d: any)=> d.id !== id));
      try { setDefs(await window.api.getAchievements()); } catch {}
      try { setState(await window.api.getAchievementState()); } catch {}
      if (editingId === id) { setEditingId(null); setShowEditor(false); }
      try { show('Marked as unwatched', { type: 'info' as any }); } catch {}
    } catch {}
  };

  // Listen for achievement unlocks and show a small toast (Steam-like bottom-right)
  useEffect(() => {
    const off = window.api.onAchievementUnlocked?.((payload: { name: string; icon?: string; rarity?: string }) => {
      // If the unlocked achievement has a badge defined, prefer its icon in toast
      let toastIcon = payload.icon;
      try {
        const match: any = defs.find(d=>d.name===payload.name);
        if (match?.badge?.icon) toastIcon = match.badge.icon;
      } catch {}
      const rareType = payload.rarity === 'legendary' ? 'warning' : 'success';
      try { show(`Achievement Unlocked — ${payload.name}`, { type: rareType as any, icon: toastIcon, rarity: payload.rarity as any }); } catch {}
      // After unlock, refresh achievement state for immediate UI update
      if (!showEditor && achievementView!=='manage') {
        window.api.getAchievementState?.().then(s=> setState(s)).catch(()=>{});
      }
    });
    return () => { try { off?.(); } catch {} };
  }, [showEditor, defs, achievementView]);

  // Persist manual overrides in UI prefs to survive restarts
  useEffect(() => {
    try { (window.api.setUiPrefs as any)({ completionOverrides: completionOverride }); } catch {}
  }, [completionOverride]);

  const buildInsights = async (historySnapshot?: Record<string, number>) => {
    try {
      setInsightsLoading(true);
      const entries = Object.entries(historySnapshot ?? history);
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

      // completed videos (>=95% watched or near end: remaining <= 10s, only for long videos), respecting manual overrides
      const completedList: InsightData["completed"] = [];
      for (const p of allPaths) {
        const durSec = pathMeta[p]?.duration || 0;
        const totMin = statsMap[p]?.total || 0;
        const totSec = totMin * 60;
        const lastPos = statsMap[p]?.lastPos;
        const remaining = (durSec > 0 && typeof lastPos === 'number') ? Math.max(0, durSec - lastPos) : undefined;
        const allowNearEnd = durSec >= NEAR_END_MIN_DURATION_SEC;
        const nearEnd = allowNearEnd && (remaining !== undefined ? (remaining <= 10) : false);
  const ratio = durSec > 0 ? (totSec / durSec) : 0;
  // Also consider session-sticky completedMap to avoid removals when rewatching
  const stickyCompleted = !!completedMap[p];
  const override = completionOverride[p];
  const isCompleted = override === 'unwatched' ? false : (override === 'watched' ? true : (stickyCompleted || (durSec > 0 && (ratio >= 0.95 || nearEnd))));
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
      setInsightsDirty(false);
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

  // Only build insights when needed: on first open or when marked dirty
  useEffect(() => {
    if (activeTab === 'INSIGHTS' && (insightsDirty || !insights)) {
      buildInsights();
    }
  }, [activeTab, insightsDirty]);

  // Poll achievement state while on ACHIEVEMENTS tab for live progress (pause while editing or in Manage view to avoid input jank)
  useEffect(()=>{
    if (activeTab !== 'ACHIEVEMENTS' || showEditor || achievementView==='manage') return; // skip polling when editing or managing
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await window.api.getAchievementState();
        if (!cancelled) setState(st);
      } catch {}
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeTab, showEditor, achievementView]);

  // Accumulator for mid-playback watch time batching for smoother, more frequent achievement progress updates
  const watchAccumRef = useRef<{ path: string; accumulated: number } | null>(null);

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
        window.api.getMeta(v.path).then(async (meta) => {
          setLibFolderVideos(prev => prev.map(p => p.path === v.path ? { ...p, ...meta } : p));
          await recomputeCompletion(v.path, (meta as any)?.duration);
        });
      }
    } catch {}
  };

  const refreshMeta = (items: VideoItem[] = videos) => {
    // prime first fold
    for (const v of items.slice(0, 24)) {
      window.api.getMeta(v.path).then(async (meta) => {
        setVideos(prev => prev.map(p => p.path === v.path ? { ...p, ...meta } : p));
        await recomputeCompletion(v.path, (meta as any)?.duration);
      });
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
              window.api.getMeta(p).then(async (meta) => {
                setVideos(prev => prev.map(x => x.path === p ? { ...x, ...meta } : x));
                await recomputeCompletion(p, (meta as any)?.duration);
              });
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
        /* Player fullscreen sizing (via :fullscreen and class fallback) */
        .player-fs-root:fullscreen { position: fixed; inset: 0; width: 100vw; height: 100vh; background: #000; overflow: hidden; }
        .player-fs-root:fullscreen .player-video { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none !important; max-height: none !important; object-fit: contain; background: #000; }
        .player-fs-root.player-fs-active { position: fixed; inset: 0; width: 100vw; height: 100vh; background: #000; overflow: hidden; }
        .player-fs-root.player-fs-active .player-video { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none !important; max-height: none !important; object-fit: contain; background: #000; }
        /* Hide cursor in fullscreen when controls are hidden */
        .player-fs-root.player-fs-active.hide-cursor { cursor: none; }
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
  <div className="flex pt-8 h-[calc(100vh-2rem)] items-stretch overflow-hidden">
        {/* Boot overlay for extra smoothness after splash window */}
        {bootOverlay && (
          <div className="pointer-events-none fixed inset-0 z-40" style={{ background: 'linear-gradient(180deg, rgba(17,24,39,0.85), rgba(17,24,39,0.6))', animation: 'fadeOut 420ms ease forwards' }} />
        )}
        <style>{`@keyframes fadeOut{from{opacity:1}to{opacity:0;visibility:hidden}}`}</style>
      <div
        className={`hidden md:block border-r border-slate-800 h-full overflow-x-visible overflow-y-auto transition-all duration-300 ease-in-out`}
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

  <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
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
            {/* Desktop Settings button (hidden on small screens) */}
            <div className="ml-auto hidden md:flex">
              <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700">
                <FaCog />
                <span className="hidden lg:inline">Settings</span>
              </button>
            </div>
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
            <button
              className={`px-1 py-1 tracking-wide ${activeTab==='ACHIEVEMENTS' ? 'text-sky-300 border-b-2 border-sky-400' : 'text-slate-300 hover:text-slate-100'}`}
              onClick={()=> setActiveTab('ACHIEVEMENTS')}
            >ACHIEVEMENTS</button>
          </div>
        </div>

  {/* Breadcrumbs: GLOBAL shows filesystem; LIBRARY shows UI hierarchy (Library -> Category -> Folder) */}
  {(activeTab==='GLOBAL' || activeTab==='LIBRARY') && (
    <>
      <div className="px-6 pt-2 flex items-center gap-2"></div>
      <div className="px-8 py-3">
        <div className="text-sm text-slate-300/90 overflow-x-auto whitespace-nowrap scrollbar-thin pr-2">
          {(() => {
              if (activeTab === 'LIBRARY') {
                const segs: Array<{ label: string; onClick?: () => void; key: string }> = [];
                // Library root
                segs.push({
                  key: 'lib-root',
                  label: 'Library',
                  onClick: async () => {
                    setActiveTab('LIBRARY');
                    setSelectedCategoryId(null);
                    setCategoryItems([]);
                    setLibFolderPath(null);
                    setLibFolderVideos([]);
                    try { await window.api.setUiPrefs({ categoryView: true, selectedCategoryId: null }); } catch {}
                  }
                });
                if (selectedCategoryId) {
                  const catName = (allCategories.find(c=>c.id===selectedCategoryId)?.name) || 'Category';
                  segs.push({
                    key: 'lib-cat',
                    label: catName,
                    onClick: async () => {
                      setLibFolderPath(null);
                      setLibFolderVideos([]);
                      try { await window.api.setUiPrefs({ categoryView: true, selectedCategoryId }); } catch {}
                    }
                  });
                  if (libFolderPath) {
                    const folderLabel = libFolderPath.split('\\').pop() || libFolderPath;
                    segs.push({ key: 'lib-folder', label: folderLabel });
                  }
                }
                return (
                  <>
                    {segs.map((s, i) => (
                      <span key={s.key}>
                        {i>0 && <span className="mx-1 text-slate-500">/</span>}
                        {s.onClick ? (
                          <button className={`hover:underline ${i===segs.length-1? 'text-white' : 'text-slate-200'}`} onClick={s.onClick}>{s.label}</button>
                        ) : (
                          <span className="text-white">{s.label}</span>
                        )}
                      </span>
                    ))}
                  </>
                );
              } else {
                // GLOBAL: show filesystem path breadcrumbs
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
              }
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
          <div className="mt-3 px-8 pb-12 w-full max-w-7xl mx-auto">
            {insightsLoading && (
              <div className="relative h-1 mb-3 overflow-hidden rounded bg-slate-800">
                <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-sky-500 to-indigo-400 animate-[insightbar_1.2s_ease-in-out_infinite]" />
              </div>
            )}
            <style>{`@keyframes insightbar{0%{transform:translateX(-100%)}50%{transform:translateX(120%)}100%{transform:translateX(120%)}}`}</style>
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
        ) : activeTab==='ACHIEVEMENTS' ? (
          <div className="px-8 pb-12 w-full">
            <div className="flex items-center justify-between mb-4">
              <div className="text-slate-200 text-xl font-semibold">Achievements</div>
              <div className="flex items-center gap-2 bg-slate-800/60 p-1 rounded-md border border-slate-700">
                {([
                  {k:'completed', label:'Completed'},
                  {k:'remaining', label:'Remaining'},
                  {k:'manage', label:'Manage'}
                ] as Array<{k:'completed'|'remaining'|'manage'; label:string}>).map(o => (
                  <button
                    key={o.k}
                    onClick={()=>{ setAchievementView(o.k); if (o.k!=='manage'){ setShowEditor(false); setEditingId(null);} }}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${achievementView===o.k ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700/70'}`}
                  >{o.label}</button>
                ))}
              </div>
            </div>

            {/* Summary chips (only show when not managing) */}
            {achievementView!=='manage' && (
              <div className="mb-6 flex flex-wrap gap-3 text-xs">
                <div className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-300">Total: {defs.length}</div>
                <div className="px-3 py-2 rounded-md bg-emerald-900/30 border border-emerald-700/40 text-emerald-300">Completed: {defs.filter(d=>state[d.id]?.unlockedAt).length}</div>
                <div className="px-3 py-2 rounded-md bg-sky-900/30 border border-sky-700/40 text-sky-300">Remaining: {defs.filter(d=>!state[d.id]?.unlockedAt).length}</div>
              </div>
            )}

            {achievementView==='manage' && (
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-slate-400">Create, edit or delete achievements below.</div>
                {showEditor ? (
                  <button onClick={()=> { setShowEditor(false); setEditingId(null); }} className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-sm">Close Editor</button>
                ) : (
                  <button onClick={()=> { setEditingId(null); setShowEditor(true); }} className="px-4 py-2 rounded-md bg-sky-700 hover:bg-sky-600 text-white text-sm">Create</button>
                )}
              </div>
            )}

            {showEditor && achievementView==='manage' && createPortal(
              <div className="fixed inset-0 z-[1500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={()=>{ setShowEditor(false); setEditingId(null); }}>
                <div className="w-full max-w-3xl" onClick={e=>e.stopPropagation()}>
                  <AchievementEditor
                    key={editingId || 'new'}
                    existing={editingId ? defs.find(d=>d.id===editingId) : undefined}
                    onClose={()=>{ setShowEditor(false); setEditingId(null); }}
                    onSaved={async ()=>{ try { setDefs(await window.api.getAchievements()); } catch {}; try { setState(await window.api.getAchievementState()); } catch {} }}
                    libraryCandidates={(() => {
                      const fromVideos = videos.map(v => v.path);
                      const fromCategory = categoryItems
                        .filter(it => it.type==='video')
                        .map(it => it.path)
                        .concat(Object.keys(categoryVideoMap));
                      const fromLibFolder = libFolderVideos.map(v => v.path);
                      return Array.from(new Set([...fromVideos, ...fromCategory, ...fromLibFolder]));
                    })()}
                  />
                </div>
              </div>,
              document.body
            )}

            {/* Lists */}
            {achievementView==='completed' && (
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-1 min-w-0">
                  <div className="mb-3 text-sm font-semibold text-slate-300">Completed Achievements</div>
                  <AchievementList
                    mode="completed"
                    manage={false}
                    onEdit={()=>{}}
                    onDelete={()=>{}}
                  />
                </div>
                <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
                  <div className="mb-3 text-sm font-semibold text-slate-300 flex items-center gap-2">Badges <span className="text-[11px] font-normal text-slate-500">(earned)</span></div>
                  <BadgeGrid />
                </div>
              </div>
            )}
            {achievementView==='remaining' && (
              <AchievementList
                mode="remaining"
                manage={false}
                onEdit={()=>{}}
                onDelete={()=>{}}
              />
            )}
            {achievementView==='manage' && (
              <AchievementList
                mode="all"
                manage={true}
                onEdit={(id)=> { setEditingId(id); setShowEditor(true); }}
                onDelete={handleDeleteAchievement}
              />
            )}
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
                        recomputeCompletion(vItem.path, vItem.duration, { totalMinutes: stats.totalMinutes, lastPositionSec: stats.lastPositionSec }).catch(()=>{});
                       }, 150);
                     }}
                     onMouseLeave={() => { if (hoverDelayRef.current) window.clearTimeout(hoverDelayRef.current); setHoverRect(null); setHoverPayload(null); }}
                >
                  <div onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); setItemMenu({ x: e.clientX, y: e.clientY, path: vItem.path }); }}>
                  <GameCard
                    title={vItem.name}
                    cover={vItem.thumb}
                    meta={[
                      vItem.ext.toUpperCase(),
                      formatBytes(vItem.size),
                      formatDuration(vItem.duration),
                      new Date(vItem.mtime).toLocaleDateString(),
                    ].filter(Boolean).join(' • ')}
                    watched={isWatched(vItem.path)}
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
                            recomputeCompletion(vItem.path, vItem.duration, { totalMinutes: stats.totalMinutes, lastPositionSec: stats.lastPositionSec }).catch(()=>{});
                           }, 150);
                         }}
                         onMouseLeave={() => { if (hoverDelayRef.current) window.clearTimeout(hoverDelayRef.current); setHoverRect(null); setHoverPayload(null); }}
                    >
                      <div onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); setItemMenu({ x: e.clientX, y: e.clientY, path: vItem.path }); }}>
                      <GameCard
                        title={vItem.name}
                        cover={vItem.thumb}
                        meta={[
                          vItem.ext.toUpperCase(),
                          formatBytes(vItem.size),
                          formatDuration(vItem.duration),
                          new Date(vItem.mtime).toLocaleDateString(),
                        ].filter(Boolean).join(' • ')}
                        watched={isWatched(vItem.path)}
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
            <div onContextMenu={(e)=>{ e.preventDefault(); e.stopPropagation(); setItemMenu({ x: e.clientX, y: e.clientY, path: v.path }); }}>
            <GameCard
              title={v.name}
              cover={v.thumb}
              meta={[
                v.ext.toUpperCase(),
                formatBytes(v.size),
                formatDuration(v.duration),
                new Date(v.mtime).toLocaleDateString(),
              ].filter(Boolean).join(' • ')}
              watched={isWatched(v.path)}
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

        {itemMenu && (
          <ContextMenu
            x={itemMenu.x}
            y={itemMenu.y}
            onClose={() => setItemMenu(null)}
            items={[
              { label: 'Play', onClick: async () => {
                try {
                  const local = videos.find(v=>v.path===itemMenu.path) || categoryVideoMap[itemMenu.path];
                  if (local) setSelected(local as any);
                } catch {}
                setItemMenu(null);
              }},
              { label: 'Mark as watched', onClick: async () => { await markAsWatched(itemMenu.path); setItemMenu(null); } },
              { label: 'Mark as unwatched', onClick: async () => { await markAsUnwatched(itemMenu.path); setItemMenu(null); } },
              { label: 'Reset progress', onClick: async () => { await resetProgress(itemMenu.path); setItemMenu(null); } },
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
      {(activeTab === 'GLOBAL' || activeTab === 'LIBRARY') && Object.keys(history).length > 0 && (
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
              <div className="flex items-center gap-2">
                <button
                  onClick={(e)=>{ const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPlayerMenu({ x: rect.left, y: rect.bottom + 4, path: selected.path }); }}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
                >More</button>
                <button
                  onClick={async () => {
                    try {
                      if (!playerFullscreen && videoWrapRef.current) {
                        await videoWrapRef.current.requestFullscreen();
                      } else if (document.fullscreenElement) {
                        await document.exitFullscreen();
                      }
                    } catch {}
                  }}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
                >{playerFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
                <button onClick={async () => { await flushPlaybackProgress('close'); setSelected(null); }} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700">Close</button>
              </div>
            </div>
            <div className="bg-black">
              <div
                ref={videoWrapRef}
                className={`relative player-fs-root ${playerFullscreen ? 'player-fs-active' : ''} ${playerFullscreen && !videoControlsVisible ? 'hide-cursor' : ''}`}
                onMouseMove={async (e) => {
                  updateControlsVisibility(true); scheduleHideControls(1600);
                  try {
                    if (!appSettings.enableScrubPreview) return;
                    if (videoControlsVisible && !seekBarHovering) { setPreviewState(p=>({...p, visible:false })); return; }
                    const wrap = videoWrapRef.current; const dur = videoElRef.current?.duration;
                    if (!wrap || !dur || !Number.isFinite(dur)) return;
                    const r = wrap.getBoundingClientRect();
                    const x = e.clientX - r.left; const y = e.clientY - r.top;
                    if (y < 0 || x < 0 || x > r.width || y > r.height) { setPreviewState(p=>({...p, visible:false})); return; }
                    const nearBottom = (r.height - y) <= PREVIEW_BAND_PX;
                    if (!nearBottom) { setPreviewState(p=>({...p, visible:false})); return; }
                    const frac = Math.max(0, Math.min(1, x / Math.max(1, r.width)));
                    const t = frac * dur;
                    const bin = Math.floor(t / PREVIEW_STEP_SEC) * PREVIEW_STEP_SEC;
                    if (lastPreviewBinRef.current !== bin) {
                      lastPreviewBinRef.current = bin;
                      // request image (async); optimistic show loading
                      setPreviewState(p => ({ ...p, visible: true, x, timeSec: t, loading: true }));
                      const url = await ensurePreviewForTime(t);
                      if (url) setPreviewState(p => ({ ...p, visible: true, x, timeSec: t, url, loading: false }));
                      else setPreviewState(p=> ({...p, visible:true, x, timeSec:t, loading:false }));
                    } else {
                      setPreviewState(p => ({ ...p, visible: true, x, timeSec: t }));
                    }
                  } catch {}
                }}
                onMouseLeave={() => { if (!videoPaused) updateControlsVisibility(false); setPreviewState(p=>({...p, visible:false})); }}
              >
              <video
                ref={videoElRef}
                src={fileUrl(selected.path)}
                controls={false}
                autoPlay
                className={'player-video w-full max-h-[70vh] object-contain bg-black'}
                onDoubleClick={async (e) => {
                  // Prefer wrapper fullscreen on double click
                  e.preventDefault();
                  try {
                    if (!playerFullscreen && videoWrapRef.current) {
                      await videoWrapRef.current.requestFullscreen();
                    } else if (document.fullscreenElement) {
                      await document.exitFullscreen();
                    }
                  } catch {}
                }}
                onPlay={() => {
                  window.api.markWatched(selected.path);
                  watchTimerRef.current = { path: selected.path, lastTick: Date.now() };
                  setVideoPaused(false);
                  updateControlsVisibility(true);
                  scheduleHideControls(1600);
                  refreshHistory();
                  const v = videoElRef.current; if (v) { setDurationSec(Number.isFinite(v.duration) ? v.duration : 0); setVolume(v.volume); setMuted(v.muted); setPlaybackRate(v.playbackRate); }
                }}
                onTimeUpdate={(e) => {
                  try {
                    const v = e.currentTarget as HTMLVideoElement;
                    if (!v || !Number.isFinite(v.currentTime)) return;
                    setCurrentTimeSec(v.currentTime);
                    const now = Date.now();
                    // Save playback position every 5s (monotonic)
                    if (now - posSaveTickRef.current > 5000) {
                      if (watchTimerRef.current?.path) {
                        setLastPositionMax(watchTimerRef.current.path, v.currentTime).catch(()=>{});
                        if (Number.isFinite(v.currentTime)) {
                          const cur = lastPosRef.current[watchTimerRef.current.path];
                          if (cur === undefined || v.currentTime > cur) lastPosRef.current[watchTimerRef.current.path] = v.currentTime;
                        }
                      }
                      posSaveTickRef.current = now;
                    }
                    if (watchTimerRef.current?.path) {
                      const path = watchTimerRef.current.path;
                      if (!watchAccumRef.current || watchAccumRef.current.path !== path) {
                        watchAccumRef.current = { path, accumulated: 0 };
                      }
                      const deltaSec = (now - watchTimerRef.current.lastTick) / 1000;
                      if (deltaSec >= 1) {
                        watchAccumRef.current.accumulated += deltaSec;
                        watchTimerRef.current.lastTick = now;
                      }
                      // Flush every ~15s of accumulated actual watch time
                      if (watchAccumRef.current.accumulated >= 15) {
                        const toSend = Math.floor(watchAccumRef.current.accumulated);
                        if (toSend > 0) {
                          window.api.addWatchTime(path, toSend).catch(()=>{});
                          setInsightsDirty(true);
                          watchAccumRef.current.accumulated -= toSend;
                          if (activeTab === 'ACHIEVEMENTS' && !showEditor) {
                            window.api.getAchievementState().then(s=> setState(s)).catch(()=>{});
                          }
                          // intentionally skip refreshHistory() here to avoid chattiness
                        }
                      }
                    }
                  } catch {}
                }}
                onPause={() => {
                  flushPlaybackProgress('pause');
                  if (activeTab === 'ACHIEVEMENTS' && !showEditor) {
                    window.api.getAchievementState().then(s=> setState(s)).catch(()=>{});
                  }
                  refreshHistory();
                  setVideoPaused(true);
                  updateControlsVisibility(true);
                }}
                onEnded={() => {
                  flushPlaybackProgress('ended');
                  if (activeTab === 'ACHIEVEMENTS' && !showEditor) {
                    window.api.getAchievementState().then(s=> setState(s)).catch(()=>{});
                  }
                  refreshHistory();
                }}
              />
              {/* Custom Controls Bar */}
              <div
                className={`absolute left-0 right-0 bottom-0 z-[55] transition-opacity ${videoControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onMouseMove={() => { updateControlsVisibility(true); scheduleHideControls(1600); }}
              >
                <div className="px-3 pt-8 pb-3 bg-gradient-to-t from-black/80 to-black/0">
                  {/* Seek bar */}
                  <div
                    className="relative h-3 cursor-pointer group"
                    onMouseEnter={()=>{ setSeekBarHovering(true); }}
                    onMouseDown={(e)=>{ setSeeking(true); onSeekBarMouse(e as any); }}
                    onMouseMove={async (e)=>{
                      if (seeking) onSeekBarMouse(e as any);
                      try {
                        if (!appSettings.enableScrubPreview) return;
                        const bar = e.currentTarget as HTMLDivElement;
                        const wrap = videoWrapRef.current;
                        const vdur = durationSec;
                        if (!wrap || !Number.isFinite(vdur) || vdur<=0) return;
                        const barRect = bar.getBoundingClientRect();
                        const wrapRect = wrap.getBoundingClientRect();
                        const localX = Math.max(0, Math.min(barRect.width, e.clientX - barRect.left));
                        const frac = barRect.width > 0 ? localX / barRect.width : 0;
                        const t = frac * vdur;
                        const bin = Math.floor(t / PREVIEW_STEP_SEC) * PREVIEW_STEP_SEC;
                        const xInWrap = (barRect.left - wrapRect.left) + localX;
                        if (lastPreviewBinRef.current !== bin) {
                          lastPreviewBinRef.current = bin;
                          setPreviewState(p => ({ ...p, visible: true, x: xInWrap, timeSec: t, loading: true }));
                          const url = await ensurePreviewForTime(t);
                          if (url) setPreviewState(p => ({ ...p, visible: true, x: xInWrap, timeSec: t, url, loading: false }));
                          else setPreviewState(p=> ({...p, visible:true, x: xInWrap, timeSec:t, loading:false }));
                        } else {
                          setPreviewState(p => ({ ...p, visible: true, x: xInWrap, timeSec: t }));
                        }
                      } catch {}
                    }}
                    onMouseUp={()=>{ setSeeking(false); }}
                    onMouseLeave={()=>{ setSeeking(false); setSeekBarHovering(false); if (!seeking) setPreviewState(p=>({...p, visible:false })); }}
                    onClick={(e)=> onSeekBarMouse(e as any)}
                    onDoubleClick={(e)=> e.stopPropagation()}
                  >
                    <div className="absolute inset-y-1 left-0 right-0 rounded bg-slate-700/60" />
                    <div className="absolute inset-y-1 left-0 rounded bg-slate-400/60" style={{ width: `${bufferedFrac*100}%` }} />
                    <div className="absolute inset-y-0 left-0 flex items-center" style={{ width: `${progressFrac*100}%` }}>
                      <div className="h-3 rounded bg-sky-400" style={{ width: '100%' }} />
                      <div className="h-4 w-4 -ml-2 rounded-full bg-white shadow group-hover:scale-110 transform transition" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-sm text-slate-200">
                    {/* Play/Pause */}
                    <button
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                      onClick={() => {
                        const v = videoElRef.current; if (!v) return;
                        if (v.paused) { v.play(); setVideoPaused(false); } else { v.pause(); setVideoPaused(true); }
                        updateControlsVisibility(true); scheduleHideControls(1600);
                      }}
                    >{videoPaused ? 'Play' : 'Pause'}</button>
                    {/* Time */}
                    <div className="min-w-[88px] text-xs text-slate-300">{fmt(currentTimeSec)} / {fmt(durationSec)}</div>
                    {/* Volume */}
                    <button className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={()=>{ const v = videoElRef.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }}>
                      {muted || volume===0 ? 'Unmute' : 'Mute'}
                    </button>
                    <input type="range" min={0} max={1} step={0.01} value={muted?0:volume}
                      onChange={(e)=>{ const v = videoElRef.current; if (!v) return; const val = parseFloat((e.target as HTMLInputElement).value); v.volume = val; v.muted = val===0; setVolume(val); setMuted(v.muted); }}
                      className="w-28 accent-sky-400"
                    />
                    {/* Speed */}
                    <div className="ml-auto flex items-center gap-2">
                      <button className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={()=>{ const v = videoElRef.current; if (!v) return; const r = Math.max(0.25, Math.round((v.playbackRate-0.25)*100)/100); v.playbackRate = r; setPlaybackRate(r); }}>-</button>
                      <div className="w-14 text-center text-xs">{playbackRate.toFixed(2)}x</div>
                      <button className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={()=>{ const v = videoElRef.current; if (!v) return; const r = Math.min(4, Math.round((v.playbackRate+0.25)*100)/100); v.playbackRate = r; setPlaybackRate(r); }}>+</button>
                      <button className="ml-3 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={async ()=>{
                        try {
                          if (!playerFullscreen && videoWrapRef.current) { await videoWrapRef.current.requestFullscreen(); }
                          else if (document.fullscreenElement) { await document.exitFullscreen(); }
                        } catch {}
                      }}>{playerFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
                    </div>
                  </div>
                </div>
              </div>
              {/* Scrub preview overlay */}
              {previewState.visible && appSettings.enableHoverPreviews && (seekBarHovering || !videoControlsVisible) && (
                <div
                  className="pointer-events-none absolute z-[60]"
                  style={{ left: Math.round(previewState.x), bottom: PREVIEW_BAND_PX + 8, transform: 'translateX(-50%)' }}
                >
                  <div className="rounded-md overflow-hidden border border-slate-700 shadow-lg bg-black/80">
                    {previewState.url ? (
                      <img src={previewState.url} alt="preview" style={{ width: PREVIEW_WIDTH, height: 'auto', display: 'block' }} />
                    ) : (
                      <div style={{ width: PREVIEW_WIDTH, height: Math.round((PREVIEW_WIDTH*9)/16) }} className="bg-slate-900/70" />
                    )}
                    <div className="px-2 py-1 text-[11px] text-slate-200 bg-black/70 border-t border-slate-700/70">
                      {formatDuration(previewState.timeSec) || '0:00'}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {playerMenu && (
        <ContextMenu
          x={playerMenu.x}
          y={playerMenu.y}
          onClose={() => setPlayerMenu(null)}
          items={[
            { label: 'Mark as watched', onClick: async () => { await markAsWatched(playerMenu.path); setPlayerMenu(null); } },
            { label: 'Mark as unwatched', onClick: async () => { await markAsUnwatched(playerMenu.path); setPlayerMenu(null); } },
            { label: 'Reset progress', onClick: async () => { await resetProgress(playerMenu.path); setPlayerMenu(null); } },
          ]}
        />
      )}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={async () => {
          try {
            const s = await window.api.getAppSettings();
            setAppSettings({
              enableHoverPreviews: !!s.enableHoverPreviews,
              enableScrubPreview: s.enableScrubPreview !== false,
              enableAutoplayNext: s.enableAutoplayNext !== false,
              autoplayCountdownSec: (typeof s.autoplayCountdownSec==='number' ? Math.min(10, Math.max(3, Math.round(s.autoplayCountdownSec))) : 5)
            });
          } catch {}
          refreshMeta();
        }}
      />
      </div>
    </div>
    </div>
  );
}

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
