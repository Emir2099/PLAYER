import React from 'react';

type Props = {
  title: string;
  cover?: string | null;
  meta?: string;
  onOpen?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDropImage?: (filePath: string) => void;
};

const CategoryCard: React.FC<Props> = ({ title, cover, meta, onOpen, onContextMenu, onDropImage }) => {
  return (
    <div
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e)=>{
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (!['jpg','jpeg','png','webp'].includes(ext)) return;
        onDropImage?.(f.path);
      }}
      className="group relative rounded-[10px] overflow-hidden border border-[#1c2636] bg-[#131a24] hover:border-[#2f3f59] transition-all duration-200 shadow-[0_1px_0_#0b111a_inset,0_0_0_1px_rgba(0,0,0,0.4)] hover:shadow-[0_1px_0_#0b111a_inset,0_0_0_1px_rgba(0,0,0,0.4),0_12px_30px_rgba(0,0,0,0.35)] cursor-pointer"
      style={{ aspectRatio: '10 / 16' }}
      title={title}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a2333] to-[#0e141c] opacity-70" />
      {cover ? (
        <img src={cover} alt="cover" className="absolute inset-0 w-full h-full object-cover scale-[1.02] group-hover:scale-[1.06] transition-transform duration-300" />
      ) : (
        <div className="absolute inset-0 skeleton-shimmer" />
      )}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-[45%] bg-gradient-to-b from-white/8 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_120%,rgba(0,0,0,0.6),rgba(0,0,0,0))]" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="text-[13px] font-semibold tracking-wide drop-shadow-[0_2px_1px_rgba(0,0,0,0.6)] line-clamp-2">
          {title}
        </div>
        {meta && <div className="mt-1 text-[11px] text-slate-300/85 line-clamp-1">{meta}</div>}
      </div>
    </div>
  );
};

export default CategoryCard;
