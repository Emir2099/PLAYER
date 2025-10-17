import React, { useEffect, useState } from 'react';
import { FaFolderOpen } from 'react-icons/fa';
import { useToast } from './Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

const SettingsModal: React.FC<Props> = ({ open, onClose, onSaved }) => {
  const { show, close } = useToast();
  const [ffmpegPath, setFfmpegPath] = useState<string>('');
  const [ffprobePath, setFfprobePath] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [enableHoverPreviews, setEnableHoverPreviews] = useState<boolean>(true);
  const [enableDiscordPresence, setEnableDiscordPresence] = useState<boolean>(true);
  const [enableScrubPreview, setEnableScrubPreview] = useState<boolean>(true);
  const [enableAchievementChime, setEnableAchievementChime] = useState<boolean>(true);
  const [enableAutoplayNext, setEnableAutoplayNext] = useState<boolean>(true);
  const [autoplayCountdownSec, setAutoplayCountdownSec] = useState<number>(5);
  const [testingFF, setTestingFF] = useState(false);
  const [defaultFolder, setDefaultFolder] = useState<string | undefined>(undefined);

  // Minimal runtime-safe typing for extended settings
  type AppSettings = { enableHoverPreviews?: boolean; enableScrubPreview?: boolean; enableAchievementChime?: boolean; enableAutoplayNext?: boolean; autoplayCountdownSec?: number };

  useEffect(() => {
    if (!open) return;
    (async () => {
      const curr = await window.api.getFFPaths();
      setFfmpegPath(curr.ffmpegPath || '');
      setFfprobePath(curr.ffprobePath || '');
      try { setDefaultFolder(await window.api.getLastFolder()); } catch {}
      try {
    const s: AppSettings = await window.api.getAppSettings();
        setEnableHoverPreviews(!!s.enableHoverPreviews);
        if (typeof s.enableScrubPreview === 'boolean') setEnableScrubPreview(!!s.enableScrubPreview); else setEnableScrubPreview(true);
  if (typeof s.enableAchievementChime === 'boolean') setEnableAchievementChime(!!s.enableAchievementChime);
  if (typeof (s as any).enableDiscordPresence === 'boolean') setEnableDiscordPresence(!!(s as any).enableDiscordPresence);
  if (typeof s.enableAutoplayNext === 'boolean') setEnableAutoplayNext(!!s.enableAutoplayNext); else setEnableAutoplayNext(true);
  if (typeof s.autoplayCountdownSec === 'number') setAutoplayCountdownSec(Math.min(10, Math.max(3, Math.round(s.autoplayCountdownSec)))); else setAutoplayCountdownSec(5);
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
  await window.api.setAppSettings({ enableHoverPreviews, enableScrubPreview, enableAchievementChime, enableAutoplayNext, autoplayCountdownSec, enableDiscordPresence } as any);
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const testFF = async () => {
    setTestingFF(true);
    const toastId = show('Testing FFmpeg…', { loading: true, timeout: 0 });
    try {
      const res = await window.api.testFF();
      close(toastId);
      if (!res.ffmpegOk || !res.ffprobeOk) {
        const parts: string[] = [];
        if (!res.ffmpegOk) parts.push(`FFmpeg error: ${res.ffmpegError || 'not found'}`);
        if (!res.ffprobeOk) parts.push(`FFprobe error: ${res.ffprobeError || 'not found'}`);
        show(parts.join(' | '), { type: 'error' });
      } else {
        show('FFmpeg and FFprobe are configured', { type: 'success' });
      }
    } finally {
      setTestingFF(false);
    }
  };

  const chooseLibraryFolder = async () => {
    const sel = await window.api.selectFolder();
    if (sel) {
      setDefaultFolder(sel);
      try { await window.api.setLastFolder(sel); } catch {}
      onSaved?.(); // allow parent to refresh
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-steam-panel rounded-xl border border-slate-800 w-full max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-800 text-lg font-semibold">Settings</div>
        <div className="p-5 space-y-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button onClick={chooseLibraryFolder} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-100">
              <FaFolderOpen />
              <span>Choose Folder</span>
            </button>
            <div className="flex items-center gap-2">
              <button onClick={testFF} disabled={testingFF} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 disabled:opacity-60">{testingFF ? 'Testing…' : 'Test FFmpeg'}</button>
            </div>
            {defaultFolder && (
              <div className="col-span-full text-xs text-slate-400 truncate">Current folder: {defaultFolder}</div>
            )}
          </div>
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
            <label className="inline-flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableScrubPreview}
                onChange={e => setEnableScrubPreview(e.target.checked)}
                className="accent-steam-accent"
              />
              <span className="text-sm text-slate-200">Enable scrub preview thumbnails</span>
            </label>
            <div className="text-xs text-slate-400 mt-1">Show a small thumbnail when hovering the progress bar area.</div>
          </div>
          <div>
            <label className="inline-flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableAutoplayNext}
                onChange={e => setEnableAutoplayNext(e.target.checked)}
                className="accent-steam-accent"
              />
              <span className="text-sm text-slate-200">Enable autoplay next</span>
            </label>
            <div className="text-xs text-slate-400 mt-1">After a video ends, start the next item automatically with a short cancelable countdown.</div>
            {enableAutoplayNext && (
              <div className="mt-3 flex items-center gap-3">
                <label className="text-xs text-slate-400">Countdown seconds</label>
                <input
                  type="range"
                  min={3}
                  max={10}
                  value={autoplayCountdownSec}
                  onChange={e => setAutoplayCountdownSec(Math.min(10, Math.max(3, parseInt(e.target.value||'5',10))))}
                />
                <div className="text-xs text-slate-300 w-8 text-right">{autoplayCountdownSec}s</div>
              </div>
            )}
          </div>
          <div>
            <label className="inline-flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableAchievementChime}
                onChange={e => setEnableAchievementChime(e.target.checked)}
                className="accent-steam-accent"
              />
              <span className="text-sm text-slate-200">Play sound on achievement unlock</span>
            </label>
            <div className="text-xs text-slate-400 mt-1">Adds a short chime when an achievement toast appears.</div>
          </div>
          <div>
            <label className="inline-flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableDiscordPresence}
                onChange={e => setEnableDiscordPresence(e.target.checked)}
                className="accent-steam-accent"
              />
              <span className="text-sm text-slate-200">Enable Discord Rich Presence</span>
            </label>
            <div className="text-xs text-slate-400 mt-1">When enabled, PrismPlay will show the current playing video as your Discord activity (opt-in). Requires Discord desktop app.</div>
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
