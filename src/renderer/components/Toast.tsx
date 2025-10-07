import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ToastItem = { id: number; type?: 'info' | 'success' | 'error' | 'warning'; message: string; timeout?: number };

type ToastCtx = {
  show: (message: string, opts?: { type?: ToastItem['type']; timeout?: number }) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, opts?: { type?: ToastItem['type']; timeout?: number }) => {
    const id = Date.now() + Math.random();
    const entry: ToastItem = { id, message, type: opts?.type ?? 'info', timeout: opts?.timeout ?? 3500 };
    setItems((prev) => [...prev, entry]);
    if (entry.timeout && entry.timeout > 0) {
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), entry.timeout);
    }
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={[
              'px-4 py-2 rounded shadow-lg border text-sm',
              'backdrop-blur bg-slate-900/80',
              t.type === 'error' ? 'border-red-500/40 text-red-200' :
              t.type === 'success' ? 'border-emerald-500/40 text-emerald-200' :
              t.type === 'warning' ? 'border-yellow-500/40 text-yellow-200' : 'border-sky-500/40 text-slate-200',
            ].join(' ')}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
};
