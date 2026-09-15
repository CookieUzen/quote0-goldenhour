import './net.js';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { buildFrame } from './card.js';
import { setupFonts } from './render.js';

const FRAMES = Math.max(1, Number(process.env.FRAMES ?? 1));
const OUT = process.env.OUT_DIR ?? 'out';

async function main(): Promise<void> {
  setupFonts();
  // Optional: override the moment for previewing other stages,
  // e.g. NOW=2026-09-15T23:00:00Z npm run dev
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  await mkdir(OUT, { recursive: true });

  for (let f = 0; f < FRAMES; f++) {
    const png = await buildFrame(f, now);
    const bw = await sharp(png).greyscale().threshold(150).png().toBuffer();
    await writeFile(`${OUT}/card-f${f}.png`, bw);
    console.log(`wrote ${OUT}/card-f${f}.png`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
