import React from 'react';
import { FaPlay } from 'react-icons/fa';

export type GameCardProps = {
  title: string;
  cover?: string | null;
  meta?: string;
  watched?: boolean;
  onPlay?: () => void;
  onClick?: () => void;
};

const GameCard: React.FC<GameCardProps> = ({ title, cover, meta, watched, onPlay, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="group relative rounded-[10px] overflow-hidden border border-[#1c2636] bg-[#131a24] hover:border-[#2f3f59] transition-all duration-200 shadow-[0_1px_0_#0b111a_inset,0_0_0_1px_rgba(0,0,0,0.4)] hover:shadow-[0_1px_0_#0b111a_inset,0_0_0_1px_rgba(0,0,0,0.4),0_12px_30px_rgba(0,0,0,0.35)] cursor-pointer"
      style={{ aspectRatio: '10 / 16' }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a2333] to-[#0e141c] opacity-80" />
      {cover ? (
        <img src={cover} alt="cover" className="absolute inset-0 w-full h-full object-cover scale-[1.02] group-hover:scale-[1.06] transition-transform duration-300" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#243349] to-[#141b26]" />
      )}
      {/* Gloss and vignette */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/7 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_0%,rgba(255,255,255,0.18),rgba(255,255,255,0)_60%)] mix-blend-overlay opacity-30" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_50%_at_50%_120%,rgba(0,0,0,0.55),rgba(0,0,0,0))]" />
      </div>
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
