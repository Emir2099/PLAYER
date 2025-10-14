import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import * as JimpNS from 'jimp';

const SRC_HEADER = 'public/header_img.png';
const SRC_SIDEBAR = 'public/sidebar_img.png';
const OUT_HEADER = 'build/installerHeader.bmp';
const OUT_SIDEBAR = 'build/installerSidebar.bmp';

function ensureDir(p){ try { mkdirSync(p, { recursive: true }); } catch {} }

async function convertOne(src, out, w, h) {
  if (!existsSync(src)) {
    throw new Error(`Missing source image: ${src}`);
  }
  ensureDir(dirname(out));
  const Jimp = JimpNS.Jimp || JimpNS;
  const img = await Jimp.read(src);
  // cover: scale to fill and center-crop using new API
  await img.cover({ w, h, position: 'center' });
  await img.write(out); // extension determines BMP format
  console.log(`Converted ${src} -> ${out} (${w}x${h})`);
}

async function main(){
  await convertOne(SRC_HEADER, OUT_HEADER, 150, 57);
  await convertOne(SRC_SIDEBAR, OUT_SIDEBAR, 164, 314);
}

main().catch(err => { console.error(err); process.exit(1); });
