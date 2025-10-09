import React, { useEffect, useRef, useState } from 'react';
import { FaCog } from 'react-icons/fa';
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
    } catch {}
  };

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="px-1">Categories</span>
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
      <div className="flex flex-col gap-1">
        {cats.map(c => (
          <div key={c.id}
               className={`px-2 py-1 rounded cursor-pointer ${active===c.id? 'bg-slate-800 text-white':'hover:bg-slate-800/60'}`}
               draggable={false}
               onClick={async ()=>{ setActive(c.id); onSelect?.(c.id); await window.api.setUiPrefs({ selectedCategoryId: c.id }); }}
               onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; }}
               onDrop={(e)=>onDropTo(c.id, e)}
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
                <span className="truncate" title={c.name}>{c.name}</span>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{c.items.length}</span>
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
