import React from 'react';
import { FaPlay } from 'react-icons/fa';

export type GameCardProps = {
  title: string;
  cover?: string | null;
  meta?: string;
  watched?: boolean;
  onPlay?: () => void;
  onClick?: () => void;
  accent?: 'slate' | 'blue' | 'emerald' | 'purple';
  infoPosition?: 'top' | 'center';
  overlayThumb?: string | null;
  overlayDetails?: string[];
};

const GameCard: React.FC<GameCardProps> = ({ title, cover, meta, watched, onPlay, onClick, accent = 'slate', infoPosition = 'top', overlayThumb, overlayDetails }) => {
  const accentCls = accent === 'blue'
    ? 'from-[#2aa8ff] via-[#65d3ff]'
    : accent === 'emerald'
    ? 'from-emerald-400 via-emerald-200'
    : accent === 'purple'
    ? 'from-fuchsia-400 via-fuchsia-200'
    : 'from-slate-400 via-slate-200';
  return (
    <div
      onClick={onClick}
      className="card-hover group relative rounded-[10px] overflow-hidden border border-[#1c2636] bg-[#131a24] hover:border-[#2f3f59] transition-all duration-200 shadow-[0_1px_0_#0b111a_inset,0_0_0_1px_rgba(0,0,0,0.4)] hover:shadow-[0_1px_0_#0b111a_inset,0_0_0_1px_rgba(0,0,0,0.4),0_12px_30px_rgba(0,0,0,0.35)] cursor-pointer"
      style={{ aspectRatio: '10 / 16' }}
    >
      {/* subtle left spine accent */}
  <div className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b ${accentCls} to-transparent opacity-30 group-hover:opacity-60 transition-opacity`} />
      {/* base gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a2333] to-[#0e141c] opacity-70" />
      {cover ? (
        <img src={cover} alt="cover" className="absolute inset-0 w-full h-full object-cover scale-[1.02] group-hover:scale-[1.06] transition-transform duration-300" />
      ) : (
        <div className="absolute inset-0 skeleton-shimmer" />
      )}
      {/* Gloss, vignette and shine sweep */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-[45%] bg-gradient-to-b from-white/8 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_0%,rgba(255,255,255,0.18),rgba(255,255,255,0)_60%)] mix-blend-overlay opacity-25" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_120%,rgba(0,0,0,0.6),rgba(0,0,0,0))]" />
        <div className="card-shine" />
      </div>
      {/* Hover info tile (Steam-like) */}
      {infoPosition === 'top' ? (
        <div className="absolute top-3 left-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="max-w-[85%] rounded-md overflow-hidden border border-black/50 shadow-lg bg-gradient-to-b from-[#5c6673]/90 to-[#424a55]/90 text-[#e8edf2]">
            {/* Header */}
            <div className="px-3 py-2 text-[12px] font-semibold bg-gradient-to-b from-[#7a8491]/80 to-transparent border-b border-black/40 line-clamp-1">
              {title}
            </div>
            {/* Body */}
            <div className="p-3 flex gap-3 items-start">
              <div className="w-[96px] shrink-0 rounded overflow-hidden bg-black/30 border border-black/40">
                {overlayThumb || cover ? (
                  <img src={overlayThumb || cover!} alt="thumb" className="w-full h-[54px] object-cover" />
                ) : (
                  <div className="w-full h-[54px] bg-slate-700/40" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] tracking-widest font-semibold text-white/75">DETAILS</div>
                <div className="mt-1 space-y-0.5 text-[11px] text-white/90">
                  {(overlayDetails && overlayDetails.length ? overlayDetails : [meta]).filter(Boolean).slice(0,3).map((line, i) => (
                    <div key={i} className="line-clamp-1">{line as string}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="mx-6 rounded-md overflow-hidden bg-black/50 backdrop-blur border border-white/10 shadow p-3 text-center">
            <div className="text-[13px] font-semibold mb-1 line-clamp-2">{title}</div>
            {meta && (<div className="text-[11px] text-slate-300/90 line-clamp-2">{meta}</div>)}
          </div>
        </div>
      )}
      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="text-[13px] font-semibold tracking-wide drop-shadow-[0_2px_1px_rgba(0,0,0,0.6)] line-clamp-2">
          {title}
        </div>
        <div className="mt-1 text-[11px] text-slate-300/85 line-clamp-1">{meta}</div>
      </div>
      {/* Play CTA on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onPlay?.(); }}
        className="absolute bottom-3 right-3 px-2.5 py-1.5 text-[12px] rounded bg-[#1c86ee] text-white shadow hover:bg-[#2a90f0] opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-2"
        title="Play"
      >
        <FaPlay className="text-[10px]" /> Play
      </button>
      {watched && (
        <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded bg-black/60 border border-white/10">Watched</div>
      )}
    </div>
  );
};

export default GameCard;
