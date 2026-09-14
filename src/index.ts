import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PLACES } from './locations.js';
import { sunInfo } from './stage.js';
import { fetchWeather } from './weather.js';
import { renderCard, renderSharedCard, setupFonts, type Column } from './render.js';
import { goldenIntervals, sampleDay } from './sunpath.js';

const FRAMES = Math.max(1, Number(process.env.FRAMES ?? 1));
const OUT = process.env.OUT_DIR ?? 'out';
/** 'shared' = one 24h UTC axis with both sun paths; 'columns' = the old two-column card. */
const STYLE = process.env.CARD_STYLE === 'columns' ? 'columns' : 'shared';

function localTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/** Hours between the given timezone's clock and UTC at `at` (e.g. +7 for Jakarta). */
function tzOffsetHours(tz: string, at: Date): number {
  const probe = new Date(Math.floor(at.getTime() / 3_600_000) * 3_600_000);
  const h = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(probe),
  );
  let off = h - probe.getUTCHours();
  if (off > 12) off -= 24;
  if (off <= -12) off += 24;
  return off;
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
      code: w?.code ?? -1,
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

  if (STYLE === 'columns') {
    return renderCard(cols, 296, 152, footer);
  }

  const a = sampleDay(PLACES[0], now);
  const b = sampleDay(PLACES[1], now);
  const goldenA = goldenIntervals(a);
  const goldenB = goldenIntervals(b);
  const fmt = (ivs: Array<[number, number]>) =>
    ivs.map(([s, e]) => `${s.toFixed(1)}–${e.toFixed(1)}`).join(', ') || 'none';
  console.log(`golden hours — ${a.place.name}: ${fmt(goldenA)} | ${b.place.name}: ${fmt(goldenB)}`);

  return renderSharedCard(
    {
      a,
      b,
      goldenA,
      goldenB,
      tempA: cols[0].tempC,
      tempB: cols[1].tempC,
      codeA: cols[0].code,
      codeB: cols[1].code,
      footer,
      axisOffsetH: tzOffsetHours(PLACES[0].tz, now),
      frame,
    },
    296,
    152,
  );
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