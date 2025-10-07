import React, { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

const SettingsModal: React.FC<Props> = ({ open, onClose, onSaved }) => {
  const [ffmpegPath, setFfmpegPath] = useState<string>('');
  const [ffprobePath, setFfprobePath] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [enableHoverPreviews, setEnableHoverPreviews] = useState<boolean>(true);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const curr = await window.api.getFFPaths();
      setFfmpegPath(curr.ffmpegPath || '');
      setFfprobePath(curr.ffprobePath || '');
      try {
        const s = await window.api.getAppSettings();
        setEnableHoverPreviews(!!s.enableHoverPreviews);
      } catch {}
    })();
  }, [open]);

  const browse = async (kind: 'ffmpeg' | 'ffprobe') => {
    const selected = await window.api.selectFile([{ name: 'Executable', extensions: ['exe'] }]);
    if (!selected) return;
    if (kind === 'ffmpeg') setFfmpegPath(selected);
    else setFfprobePath(selected);
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.api.setFFPaths({ ffmpegPath: ffmpegPath || undefined, ffprobePath: ffprobePath || undefined });
      await window.api.setAppSettings({ enableHoverPreviews });
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-steam-panel rounded-xl border border-slate-800 w-full max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-800 text-lg font-semibold">Settings</div>
        <div className="p-5 space-y-5">
          <div>
            <label className="inline-flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableHoverPreviews}
                onChange={e => setEnableHoverPreviews(e.target.checked)}
                className="accent-steam-accent"
              />
              <span className="text-sm text-slate-200">Enable hover video previews</span>
            </label>
            <div className="text-xs text-slate-400 mt-1">When enabled, the hover panel plays a short, muted loop of the video.</div>
          </div>
          <div>
            <div className="text-sm text-slate-300 mb-1">FFmpeg path (optional)</div>
            <div className="flex gap-2">
              <input value={ffmpegPath} onChange={e => setFfmpegPath(e.target.value)} className="flex-1 bg-steam-card border border-slate-700 rounded px-3 py-2 text-slate-200" placeholder="C:\\path\\to\\ffmpeg.exe"/>
              <button onClick={() => browse('ffmpeg')} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white">Browse</button>
            </div>
            <div className="text-xs text-slate-400 mt-1">Used for video thumbnails. If not set, the app tries bundled/static binaries when available.</div>
          </div>
          <div>
            <div className="text-sm text-slate-300 mb-1">FFprobe path (optional)</div>
            <div className="flex gap-2">
              <input value={ffprobePath} onChange={e => setFfprobePath(e.target.value)} className="flex-1 bg-steam-card border border-slate-700 rounded px-3 py-2 text-slate-200" placeholder="C:\\path\\to\\ffprobe.exe"/>
              <button onClick={() => browse('ffprobe')} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white">Browse</button>
            </div>
            <div className="text-xs text-slate-400 mt-1">Used for reading duration. Optional but recommended.</div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-100">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded bg-steam-accent/90 hover:bg-steam-accent disabled:opacity-60 text-white">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
