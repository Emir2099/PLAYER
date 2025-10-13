# PrismPlay (Windows)

A desktop Electron + React app that scans a folder on your PC and shows your videos in a sleek, Steam-inspired library UI with cards and a built-in player.

Features
- Choose any folder and auto-scan for videos (mp4, mkv, avi, mov, wmv, webm, flv, m4v, ts, mts, m2ts)
- Sleek dark UI with search, sort, and responsive grid
- Play videos inline with a modal player
- Reveal file in Explorer
 - Optional: show duration and thumbnails using FFmpeg/FFprobe

Getting started
1) Install Node.js LTS (https://nodejs.org/) if you don't have it.
2) Install dependencies:

```powershell
cd c:\Users\capta\Desktop\PLAYER
npm install
```

3) Run in dev (hot reload):

```powershell
npm run dev
```

4) Build production:

```powershell
npm run build
npm start
```

Note: Packaging into an installer is currently not wired. If you need a distributable, we can add electron-builder later.

Notes
- To change theme colors, edit `tailwind.config.cjs`.

## FFmpeg/FFprobe setup (optional but recommended)
If you want video thumbnails and durations, point the app to FFmpeg and FFprobe executables.

Option A — Install via winget (recommended)

```powershell
# Run in a fresh PowerShell window; Admin may be required for install prompts
winget install --id Gyan.FFmpeg.Essentials -e --accept-source-agreements --accept-package-agreements
```

Find the executables after install:

```powershell
where ffmpeg
where ffprobe
```

Option B — Manual ZIP download

1) Download a Windows build from https://ffmpeg.org/download.html (choose a trusted Windows build).
2) Extract to a folder, e.g. `C:\ffmpeg\` so you have:
	- `C:\ffmpeg\bin\ffmpeg.exe`
	- `C:\ffmpeg\bin\ffprobe.exe`

Point the app to these paths:

1) Launch the app and click the “Settings” (gear) button.
2) For FFmpeg path, click Browse and select `ffmpeg.exe`.
3) For FFprobe path, click Browse and select `ffprobe.exe`.
4) Save. The app will refresh thumbnails/durations for visible items.

Tip: If `where ffmpeg` prints a path, you can also just type `ffmpeg.exe` and `ffprobe.exe` in Settings (they’ll resolve via PATH).

## Troubleshooting

Port 5173 is already in use when running dev

The dev script expects Vite on port 5173. If something else is using it, free the port:

```powershell
netstat -ano | findstr :5173
# Note the last column (PID), then:
taskkill /PID <PID_FROM_ABOVE> /F
```

Then rerun:

```powershell
npm run dev
```

Locating FFmpeg executables

```powershell
where ffmpeg
where ffprobe
```

If these return paths, copy them into the app’s Settings. If they return “INFO: Could not find files”, install FFmpeg using winget or the manual ZIP method above.
