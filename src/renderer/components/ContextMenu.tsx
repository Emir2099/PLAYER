import React, { useEffect } from 'react';

type Item = { label: string; onClick: () => void; disabled?: boolean };

type Props = {
  x: number;
  y: number;
  items: Item[];
  onClose: () => void;
};

const ContextMenu: React.FC<Props> = ({ x, y, items, onClose }) => {
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

  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 2000 }} className="min-w-[180px] rounded-md overflow-hidden border border-black/60 bg-[#2b333e] text-slate-100 shadow-xl">
      {items.map((it, idx) => (
        <button key={idx} disabled={it.disabled} onClick={it.onClick} className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed`}>
          {it.label}
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;
