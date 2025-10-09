import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Item = { label: string; onClick: () => void; disabled?: boolean };

type Props = {
  x: number;
  y: number;
  items: Item[];
  onClose: () => void;
};

const ContextMenu: React.FC<Props> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });
  useEffect(() => {
    const onDoc = () => onClose();
    document.addEventListener('click', onDoc);
    document.addEventListener('contextmenu', onDoc);
    window.addEventListener('blur', onDoc);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('contextmenu', onDoc);
      window.removeEventListener('blur', onDoc);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Place first, then measure and clamp
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - rect.width - pad);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - pad - rect.height);
    setPos({ left, top });
  }, [x, y, items.length]);

  return createPortal(
    <div ref={ref} style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 3000 }} className="min-w-[180px] rounded-md overflow-hidden border border-black/60 bg-[#2b333e] text-slate-100 shadow-xl">
      {items.map((it, idx) => (
        <button key={idx} disabled={it.disabled} onClick={(e)=>{ e.stopPropagation(); it.onClick(); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed`}>
          {it.label}
        </button>
      ))}
    </div>,
    document.body
  );
};

export default ContextMenu;
