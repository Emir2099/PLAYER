import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';

export type HoverOverlayProps = {
  open: boolean;
  anchorRect?: DOMRect | null;
  title: string;
  thumb?: string | null;
  lines?: string[];
  width?: number; // px
  offset?: number; // px
};

const HoverOverlay: React.FC<HoverOverlayProps> = ({ open, anchorRect, title, thumb, lines = [], width = 260, offset = 12 }) => {
  const pos = useMemo(() => {
    if (!open || !anchorRect) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const leftRight = anchorRect.right + offset;
    let left = leftRight;
    let top = anchorRect.top + 8;
    if (left + width + 8 > vw) {
      // flip to left side
      left = Math.max(8, anchorRect.left - width - offset);
    }
    // clamp vertical within viewport
    if (top + 160 > vh) top = Math.max(8, vh - 160 - 8);
    return { left: Math.round(left + window.scrollX), top: Math.round(top + window.scrollY) };
  }, [open, anchorRect, width, offset]);

  if (!open || !pos) return null;
  const body = document.body;
  return createPortal(
    <div style={{ position: 'absolute', left: pos.left, top: pos.top, width }} className="z-[80]">
      <div className="rounded-md overflow-hidden border border-black/50 shadow-2xl bg-gradient-to-b from-[#656c77]/95 to-[#424a55]/95 text-[#eef2f6]">
        <div className="px-3 py-2 text-[12px] font-semibold bg-gradient-to-b from-[#7e8793]/85 to-transparent border-b border-black/40 line-clamp-1">
          {title}
        </div>
        <div className="p-3">
          <div className="rounded overflow-hidden border border-black/40 bg-black/30">
            {thumb ? (
              <img src={thumb} alt="thumb" className="w-full h-[84px] object-cover" />
            ) : (
              <div className="w-full h-[84px] bg-slate-700/40" />
            )}
          </div>
          <div className="mt-3">
            <div className="text-[10px] tracking-widest font-semibold text-white/80 mb-1">TIME PLAYED</div>
            <div className="space-y-0.5 text-[11px] text-white/90">
              {(lines.length ? lines : ['Last two weeks: 0 min', 'Total: 0 min']).slice(0, 3).map((l, i) => (
                <div className="line-clamp-1" key={i}>{l}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  , body);
};

export default HoverOverlay;
