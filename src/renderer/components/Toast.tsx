import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type ToastItem = { id: number; type?: 'info' | 'success' | 'error' | 'warning'; message: string; timeout?: number; icon?: string; rarity?: 'common'|'rare'|'epic'|'legendary'; closing?: boolean };

type ToastCtx = {
  show: (message: string, opts?: { type?: ToastItem['type']; timeout?: number; icon?: string; rarity?: ToastItem['rarity'] }) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [fsHost, setFsHost] = useState<HTMLElement | null>(null);

  // Track element fullscreen state so we can render inside the fullscreen root; otherwise the toast would be hidden.
  useEffect(() => {
    const update = () => {
      const el = document.fullscreenElement as HTMLElement | null;
      setFsHost(el);
    };
    document.addEventListener('fullscreenchange', update);
    // Some browsers fire webkitfullscreenchange
    document.addEventListener('webkitfullscreenchange', update as any);
    update();
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update as any);
    };
  }, []);
  const show = useCallback((message: string, opts?: { type?: ToastItem['type']; timeout?: number; icon?: string; rarity?: ToastItem['rarity'] }) => {
    const id = Date.now() + Math.random();
    const entry: ToastItem = { id, message, type: opts?.type ?? 'info', timeout: opts?.timeout ?? 3500, icon: opts?.icon, rarity: opts?.rarity, closing: false };
    setItems((prev) => [...prev, entry]);
    if (entry.timeout && entry.timeout > 0) {
      setTimeout(() => {
        // start closing animation, then remove after it finishes
        setItems((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
        setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 260);
      }, entry.timeout);
    }
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  const layer = (
    <>
      <style>{`
        @keyframes toast-in { from { transform: translateX(18px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes toast-out { from { transform: translateX(0); opacity: 1 } to { transform: translateX(18px); opacity: 0 } }
        .toast-animate-in { animation: toast-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .toast-animate-out { animation: toast-out 220ms cubic-bezier(0.22, 1, 0.36, 1) both; }
      `}</style>
      <div className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={[
            'relative pl-3 pr-4 py-2 rounded shadow-lg border text-sm overflow-hidden group min-w-[260px] pointer-events-auto transform-gpu will-change-transform',
            t.closing ? 'toast-animate-out' : 'toast-animate-in',
            'backdrop-blur bg-slate-900/85',
            t.type === 'error' ? 'border-red-500/40 text-red-200' :
            t.type === 'success' ? 'border-emerald-500/40 text-emerald-200' :
            t.type === 'warning' ? 'border-yellow-500/40 text-yellow-200' : 'border-sky-500/40 text-slate-200',
          ].join(' ')}
          onClick={() => {
            // allow manual dismissal by click
            setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, closing: true } : x)));
            setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 220);
          }}
        >
          {t.rarity && (
            <div className={[
              'absolute inset-y-0 left-0 w-1',
              t.rarity==='legendary' ? 'bg-gradient-to-b from-orange-400 via-amber-500 to-red-500' :
              t.rarity==='epic' ? 'bg-gradient-to-b from-fuchsia-500 via-purple-500 to-indigo-500' :
              t.rarity==='rare' ? 'bg-gradient-to-b from-sky-400 via-cyan-400 to-teal-400' :
              'bg-gradient-to-b from-slate-500 via-slate-400 to-slate-300'
            ].join(' ')} />
          )}
          <div className="flex items-center gap-3">
            {t.icon && /^https?:|^file:|^data:/.test(t.icon) && (
              <div className="h-8 w-8 rounded bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
                <img src={t.icon} alt="icon" className="h-full w-full object-cover" />
              </div>
            )}
            <span className="leading-snug">
              {t.message}
              {t.rarity && (
                <div className="mt-0.5 text-[10px] tracking-wide uppercase opacity-75">
                  {t.rarity}
                </div>
              )}
            </span>
          </div>
        </div>
      ))}
      </div>
    </>
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(layer, fsHost || document.body)}
    </Ctx.Provider>
  );
};
