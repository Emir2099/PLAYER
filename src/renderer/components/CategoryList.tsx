import React, { useEffect, useRef, useState, useMemo } from 'react';
import { FaCog, FaSortAlphaDown, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import ContextMenu from './ContextMenu';

type CatItem = { type: 'video' | 'folder'; path: string };
type Category = { id: string; name: string; items: CatItem[] };

type Props = {
  onSelect?: (id: string | null) => void;
};

const CategoryList: React.FC<Props> = ({ onSelect }) => {
  const [cats, setCats] = useState<Category[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; name: string } | null>(null);
  const editingActive = editingId !== null || creating;

  const refresh = async () => {
    try {
      setCats(await window.api.getCategories());
  const prefs = await window.api.getUiPrefs();
  setActive(prefs.selectedCategoryId ?? null);
  // initialize alphaSort from persisted prefs
  try { setAlphaSort(!!prefs.alphaSort); } catch {}
    } catch {}
  };

  // UI state: alphabetical sort toggle and long-press move
  const [alphaSort, setAlphaSort] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const ignoreClickRef = useRef<boolean>(false);

  useEffect(() => { refresh(); }, []);

  // Prevent global click handlers from stealing focus while editing/creating
  useEffect(() => {
    if (!editingActive) return;
    const stop = (e: Event) => { e.stopPropagation(); };
    document.addEventListener('mousedown', stop, true);
    document.addEventListener('keydown', stop, true);
    return () => {
      document.removeEventListener('mousedown', stop, true);
      document.removeEventListener('keydown', stop, true);
    };
  }, [editingActive]);

  const create = async () => {
    const name = newName.trim() || 'New Category';
    const res = await window.api.createCategory(name);
    if (res?.ok && res.category) {
      setCreating(false); setNewName('');
      await refresh();
      try {
        await window.api.setUiPrefs({ selectedCategoryId: res.category.id, categoryView: true });
      } catch {}
      setActive(res.category.id);
      onSelect?.(res.category.id);
    }
  };

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
    setTimeout(()=> editInputRef.current?.focus(), 0);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const newLabel = (editingName || '').trim();
    const target = cats.find(c=>c.id===editingId);
    setEditingId(null);
    if (!target) return;
    if (newLabel && newLabel !== target.name) {
      await window.api.renameCategory(target.id, newLabel);
      await refresh();
    }
  };

  const onDropTo = async (id: string, e: React.DragEvent) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData('application/x-player-item');
    if (!payload) return;
    try {
      const raw: any[] = JSON.parse(payload);
      const items: CatItem[] = raw.map(r => ({ type: r.type, path: r.path }));
      const from = raw[0]?.sourceCategoryId as string | undefined;
      if (from && from !== id) {
        // Move: remove from source then add to target
        for (const it of items) {
          await window.api.removeFromCategory(from, it);
        }
      }
      await window.api.addToCategory(id, items);
      await refresh();
    } catch {}
  };

  // Autoscroll while dragging: when dragging over the list, hovering near top/bottom scrolls it
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragHoverY = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const EDGE = 48; // px from top/bottom to trigger autoscroll
  const MAX_SPEED = 18; // px per frame at the very edge

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let running = true;
    const tick = () => {
      if (!running) return;
      const y = dragHoverY.current;
      if (y != null) {
        const rect = el.getBoundingClientRect();
        let dy = 0;
        if (y < rect.top + EDGE) {
          const t = Math.max(0, EDGE - (y - rect.top));
          dy = -Math.min(MAX_SPEED, (t / EDGE) * MAX_SPEED);
        } else if (y > rect.bottom - EDGE) {
          const t = Math.max(0, EDGE - (rect.bottom - y));
          dy = Math.min(MAX_SPEED, (t / EDGE) * MAX_SPEED);
        }
        if (dy !== 0) {
          el.scrollTop = Math.max(0, Math.min(el.scrollHeight, el.scrollTop + dy));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const sortedCats = useMemo(() => {
    if (alphaSort) {
      try {
        return cats.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
      } catch {
        return cats;
      }
    }
    return cats;
  }, [cats, alphaSort]);

  // Try to persist a new order if the backend exposes an API.
  const persistOrder = async (newCats: Category[]) => {
    try {
      const ids = newCats.map(c => c.id);
      if ((window as any).api?.reorderCategories) {
        await (window as any).api.reorderCategories(ids);
      } else if ((window as any).api?.setCategoriesOrder) {
        await (window as any).api.setCategoriesOrder(ids);
      }
    } catch {}
  };

  const moveCategoryBy = async (id: string, delta: number) => {
    const idx = cats.findIndex(c => c.id === id);
    if (idx === -1) return;
    const newIndex = idx + delta;
    if (newIndex < 0 || newIndex >= cats.length) return;
    const next = cats.slice();
    const [item] = next.splice(idx, 1);
    next.splice(newIndex, 0, item);
    setCats(next);
    try { await persistOrder(next); } catch {}
  };

  // Persist alphaSort preference when toggled
  const toggleAlphaSort = async (next?: boolean) => {
    const val = typeof next === 'boolean' ? next : !alphaSort;
    setAlphaSort(val);
    try { await window.api.setUiPrefs({ alphaSort: val }); } catch {}
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Inline small animation style for the check icon */}
      <style>{`.animate-check{transform-origin:center;animation:checkpop .28s ease forwards}@keyframes checkpop{0%{transform:scale(.2) rotate(-10deg);opacity:0}60%{transform:scale(1.08) rotate(4deg);opacity:1}100%{transform:scale(1) rotate(0)}}`}</style>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="px-1">Categories</span>
          <button
            title={alphaSort ? 'Showing alphabetical' : 'Toggle alphabetical sort'}
            className={`p-1 rounded hover:bg-slate-800/60 ${alphaSort ? 'bg-slate-800 text-white' : ''}`}
            onClick={(e)=>{ e.stopPropagation(); toggleAlphaSort(); }}
          >
            <FaSortAlphaDown />
          </button>
        </div>
        <button className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700" onClick={()=>{
          setCreating(v=>{
            const next = !v;
            if (!v) setTimeout(()=> inputRef.current?.focus(), 0);
            return next;
          });
        }}>+</button>
      </div>
      {creating && (
        <div className="flex gap-2" draggable={false} onMouseDown={e=>e.stopPropagation()}>
     <input ref={inputRef} autoFocus draggable={false}
                 className="no-drag flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-700"
                 placeholder="Category name"
                 value={newName}
       onChange={e=>setNewName((e.target as HTMLInputElement).value)}
       onMouseDown={(e)=>e.stopPropagation()}
       onKeyDown={(e)=>{ e.stopPropagation(); }}
       onDragStart={(e)=> e.stopPropagation()}
          />
          <button className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={create}>Add</button>
        </div>
      )}
      <div
        ref={listRef}
        className="flex flex-col gap-1 overflow-auto flex-1 min-h-0"
        onDragOver={(e)=>{ dragHoverY.current = e.clientY; }}
        onDragLeave={()=>{ dragHoverY.current = null; }}
        onDrop={()=>{ dragHoverY.current = null; }}
      >
        {sortedCats.map(c => (
          <div key={c.id}
               className={`px-2 py-1 rounded cursor-pointer ${active===c.id? 'bg-slate-800 text-white':'hover:bg-slate-800/60'}`}
               draggable={false}
               onClick={async ()=>{ if (ignoreClickRef.current) { ignoreClickRef.current = false; return; } setActive(c.id); onSelect?.(c.id); await window.api.setUiPrefs({ selectedCategoryId: c.id }); }}
               onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; }}
               onDrop={(e)=>onDropTo(c.id, e)}
               onMouseDown={(e)=>{
                 // Start long-press timer to enter moving mode
                 if (pressTimer.current) window.clearTimeout(pressTimer.current);
                 pressTimer.current = window.setTimeout(()=>{
                   setMovingId(c.id);
                   ignoreClickRef.current = true;
                 }, 500);
               }}
               onMouseUp={()=>{ if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } }}
               onMouseLeave={()=>{ if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } }}
          >
            <div className="flex items-center justify-between gap-2">
              {editingId===c.id ? (
                <input
                  ref={editInputRef}
                  autoFocus
                  draggable={false}
                  className="no-drag min-w-0 flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-sm"
                  value={editingName}
                  onChange={e=>setEditingName((e.target as HTMLInputElement).value)}
                  onMouseDown={e=>e.stopPropagation()}
                  onKeyDown={e=>{ e.stopPropagation(); if (e.key==='Enter') { e.preventDefault(); commitRename(); } if (e.key==='Escape') { e.preventDefault(); setEditingId(null); } }}
                  onDragStart={(e)=> e.stopPropagation()}
                  onBlur={commitRename}
                />
              ) : (
                <div className="min-w-0 flex items-center gap-2">
                  <span className="truncate" title={c.name} style={{whiteSpace: 'nowrap'}}>{c.name}</span>
                  {movingId===c.id && (
                    <div className="flex items-center gap-1 ml-2 flex-none">
                      <button className="p-1 rounded hover:bg-slate-700" title="Move up" onClick={(e)=>{ e.stopPropagation(); moveCategoryBy(c.id, -1); }}><FaArrowUp /></button>
                      <button className="p-1 rounded hover:bg-slate-700" title="Move down" onClick={(e)=>{ e.stopPropagation(); moveCategoryBy(c.id, 1); }}><FaArrowDown /></button>
                      <button className="p-1 rounded hover:bg-slate-700 flex items-center justify-center" title="Done" onClick={(e)=>{ e.stopPropagation(); setMovingId(null); }}>
                        <span className="inline-block w-4 h-4 relative">
                          <svg className="w-4 h-4 text-sky-400 animate-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 flex-none" style={{minWidth: '56px'}}>
                <span className="text-xs text-slate-400" style={{width: '20px', textAlign: 'right'}}>{c.items.length}</span>
                <button
                  className="p-1 rounded hover:bg-slate-700"
                  onClick={(e)=>{ e.stopPropagation(); e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: c.id, name: c.name }); }}
                  aria-label="Category settings"
                  title="Category settings"
                >
                  <FaCog className="text-slate-300" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={()=>setMenu(null)}
          items={[
            { label: 'Rename', onClick: () => { setMenu(null); startRename(menu.id, menu.name); } },
            { label: 'Delete', onClick: async () => { const ok = confirm(`Delete category "${menu.name}"?`); setMenu(null); if (ok) { await window.api.deleteCategory(menu.id); if (active===menu.id) { setActive(null); onSelect?.(null); } await refresh(); } } },
          ]}
        />
      )}
    </div>
  );
};

export default CategoryList;
