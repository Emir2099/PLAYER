import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

function ensureDir(path) {
  try { mkdirSync(path, { recursive: true }); } catch {}
}

// Write a simple 32-bit BMP with vertical gradient (BGRA), bottom-up rows
function writeBmpGradient(path, width, height, topColor, bottomColor) {
  const headerSize = 14; // BITMAPFILEHEADER
  const dibSize = 40; // BITMAPINFOHEADER
  const bpp = 32; // 32-bit
  const bytesPerPixel = 4;
  const rowSize = width * bytesPerPixel; // no padding needed for 32-bit
  const pixelArraySize = rowSize * height;
  const fileSize = headerSize + dibSize + pixelArraySize;

  const buf = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER
  buf.write('BM', 0, 2, 'ascii');
  buf.writeUInt32LE(fileSize, 2); // bfSize
  buf.writeUInt16LE(0, 6); // bfReserved1
  buf.writeUInt16LE(0, 8); // bfReserved2
  buf.writeUInt32LE(headerSize + dibSize, 10); // bfOffBits

  // BITMAPINFOHEADER
  buf.writeUInt32LE(dibSize, 14); // biSize
  buf.writeInt32LE(width, 18); // biWidth
  buf.writeInt32LE(height, 22); // biHeight (positive -> bottom-up)
  buf.writeUInt16LE(1, 26); // biPlanes
  buf.writeUInt16LE(bpp, 28); // biBitCount
  buf.writeUInt32LE(0, 30); // biCompression (BI_RGB)
  buf.writeUInt32LE(pixelArraySize, 34); // biSizeImage
  buf.writeInt32LE(2835, 38); // biXPelsPerMeter (~72 DPI)
  buf.writeInt32LE(2835, 42); // biYPelsPerMeter
  buf.writeUInt32LE(0, 46); // biClrUsed
  buf.writeUInt32LE(0, 50); // biClrImportant

  // Gradient fill (BGRA)
  const [tb, tg, tr, ta] = topColor; // rgba but stored as bgra
  const [bb, bg, br, ba] = bottomColor;
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1 || 1);
    const r = Math.round(tr + (br - tr) * t);
    const g = Math.round(tg + (bg - tg) * t);
    const b = Math.round(tb + (bb - tb) * t);
    const a = Math.round(ta + (ba - ta) * t);
    for (let x = 0; x < width; x++) {
      const offset = headerSize + dibSize + (y * rowSize) + x * bytesPerPixel;
      buf.writeUInt8(b, offset + 0);
      buf.writeUInt8(g, offset + 1);
      buf.writeUInt8(r, offset + 2);
      buf.writeUInt8(a, offset + 3);
    }
  }

  ensureDir(dirname(path));
  writeFileSync(path, buf);
}

// Dark slate gradient, subtle
const headerPath = 'build/installerHeader.bmp';
const sidebarPath = 'build/installerSidebar.bmp';

// Colors in RGBA but we store as BGRA in writer; just pass in order and writer reorders
const top = [30, 41, 59, 255];   // rgb(30,41,59) slate-800
const bottom = [15, 23, 42, 255]; // rgb(15,23,42) slate-900

writeBmpGradient(headerPath, 150, 57, top, bottom);
writeBmpGradient(sidebarPath, 164, 314, top, bottom);

console.log('Generated NSIS BMP placeholders at', headerPath, 'and', sidebarPath);
