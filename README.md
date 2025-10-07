# Steam-like Player (Windows)

A desktop Electron + React app that scans a folder on your PC and shows your videos in a Steam-like library UI with cards and a built-in player.

Features
- Choose any folder and auto-scan for videos (mp4, mkv, avi, mov, wmv, webm, flv, m4v, ts, mts, m2ts)
- Steam-inspired dark UI with search, sort, and responsive grid
- Play videos inline with a modal player
- Reveal file in Explorer

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

5) Create a Windows installer (optional):

```powershell
npm run dist
```

Notes
- If you want video thumbnails or duration, integrate ffmpeg/ffprobe later and extend the scan in `electron/main.ts`.
- To change theme colors, edit `tailwind.config.cjs`.
