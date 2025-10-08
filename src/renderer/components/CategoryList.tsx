import React, { useEffect, useRef, useState } from 'react';

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

  const refresh = async () => {
    try {
      setCats(await window.api.getCategories());
  const prefs = await window.api.getUiPrefs();
  setActive(prefs.selectedCategoryId ?? null);
    } catch {}
  };

  useEffect(() => { refresh(); }, []);

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
        <div className="flex gap-2" draggable={false}>
          <input ref={inputRef} autoFocus draggable={false}
                 className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-700"
                 placeholder="Category name"
                 value={newName}
                 onChange={e=>setNewName((e.target as HTMLInputElement).value)}
                 onMouseDown={(e)=>e.stopPropagation()}
                 onKeyDown={(e)=>e.stopPropagation()}
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
              <span className="truncate" title={c.name}>{c.name}</span>
              <span className="text-xs text-slate-400">{c.items.length}</span>
            </div>
            <div className="mt-1 flex gap-1 opacity-70">
              <button className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700" onClick={async (e)=>{
                e.stopPropagation();
                const newLabel = prompt('Rename category', c.name) || c.name;
                if (newLabel && newLabel !== c.name) { await window.api.renameCategory(c.id, newLabel); await refresh(); }
              }}>Rename</button>
              <button className="text-[11px] px-1.5 py-0.5 rounded bg-red-900/70 hover:bg-red-800" onClick={async (e)=>{
                e.stopPropagation();
                if (confirm(`Delete category "${c.name}"?`)) { await window.api.deleteCategory(c.id); await refresh(); }
              }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CategoryList;
