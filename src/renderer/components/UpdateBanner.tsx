import React, { useEffect, useState } from 'react';

const UpdateBanner: React.FC = () => {
  const [available, setAvailable] = useState<any | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const api: any = (window as any).api;
      const offA = api.onUpdateAvailable?.((info: any) => { setAvailable(info); setDownloaded(false); }) || (()=>{});
      const offD = api.onUpdateDownloaded?.(() => { setDownloaded(true); setBusy(false); }) || (()=>{});
      const offE = api.onUpdateError?.((err: any) => { console.error('update:error', err); setBusy(false); }) || (()=>{});
      return () => { try { offA(); } catch{}; try { offD(); } catch{}; try { offE(); } catch{} };
    } catch (e) {
      // noop in dev if api missing
    }
  }, []);

  if (!available && !downloaded) return null;

  return (
    <div className="fixed left-1/2 transform -translate-x-1/2 top-4 z-[9999]">
      <div className="bg-[#0b1220] border border-slate-700 text-white px-4 py-3 rounded-md shadow-lg flex items-center gap-3">
        {!downloaded ? (
          <>
            <div className="text-sm">Update available{available?.version ? `: v${available.version}` : ''}</div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500" onClick={async () => {
                try { setBusy(true); const api:any = (window as any).api; const res = await api.downloadUpdate?.(); if (!res?.ok) { console.error('download failed', res); setBusy(false); } } catch (e) { console.error(e); setBusy(false); }
              }} disabled={busy}>Download</button>
              <button className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600" onClick={() => setAvailable(null)} disabled={busy}>Remind me later</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm">Update downloaded — ready to install</div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 rounded bg-green-600 hover:bg-green-500" onClick={async () => { try { const api:any = (window as any).api; await api.installUpdate?.(); } catch (e) { console.error(e); } }}>
                Install & Restart
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default UpdateBanner;
