import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PLACES } from './locations.js';
import { sunInfo } from './stage.js';
import { fetchWeather } from './weather.js';
import { renderCard, setupFonts, type Column } from './render.js';

const FRAMES = Math.max(1, Number(process.env.FRAMES ?? 1));
const OUT = process.env.OUT_DIR ?? 'out';

function localTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

async function buildFrame(frame: number, now: Date): Promise<Buffer> {
  const cols: Column[] = [];

  for (const p of PLACES) {
    const info = sunInfo(now, p);
    const w = await fetchWeather(p);
    cols.push({
      name: p.name,
      time: localTime(now, p.tz),
      stage: info.stage,
      tempC: w?.tempC ?? null,
      frame,
    });
    console.log(
      `${p.name.padEnd(10)} ${localTime(now, p.tz)}  ${info.stage.padEnd(13)} ` +
        `sun ${info.elevation.toFixed(1)}\u00B0  ${w ? `${Math.round(w.tempC)}\u00B0C` : '--'}`,
    );
  }

  const footer = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: PLACES[0].tz,
  }).format(now);

  return renderCard(cols, 296, 152, footer);
}

async function main(): Promise<void> {
  setupFonts();
  // Optional: override the moment for previewing other stages,
  // e.g. NOW=2026-09-15T23:00:00Z npm run dev
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  await mkdir(OUT, { recursive: true });

  for (let f = 0; f < FRAMES; f++) {
    const png = await buildFrame(f, now);
    // threshold to pure black/white for e-ink
    const bw = await sharp(png).greyscale().threshold(150).png().toBuffer();
    const file = `${OUT}/card-f${f}.png`;
    await writeFile(file, bw);
    console.log(`wrote ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});