import sharp from 'sharp';
import { PLACES } from './locations.js';
import { STAGE_LABEL, sunInfo, type Stage } from './stage.js';
import { phaseOf, quoteFor } from './quotes.js';
import { fetchWeather } from './weather.js';
import { renderCard, renderSharedCard, type Column } from './render.js';
import { goldenIntervals, sampleDay } from './sunpath.js';

/** 'shared' = one 24h axis with both sun paths; 'columns' = the old two-column card. */
const STYLE = process.env.CARD_STYLE === 'columns' ? 'columns' : 'shared';

let lastGoodMsg: string | undefined;

/**
 * Resolve the title-bar message. If MESSAGE_URL is set, it is fetched on every
 * build (plain text, or JSON with a "message" field) so a remote backend can
 * push fresh nudges; on fetch failure the last good value (or CARD_MSG) wins.
 */
async function resolveMessage(): Promise<string | undefined> {
  const url = process.env.MESSAGE_URL;
  if (!url) return process.env.CARD_MSG || undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    let msg = text;
    if (text.startsWith('{')) {
      try {
        msg = ((JSON.parse(text) as { message?: string }).message ?? '').trim();
      } catch {
        /* keep raw text */
      }
    }
    if (msg) {
      lastGoodMsg = msg;
      return msg;
    }
    console.warn('MESSAGE_URL returned empty content; keeping previous');
  } catch (err) {
    console.warn(`MESSAGE_URL fetch failed (${String(err)}); keeping previous`);
  }
  return lastGoodMsg ?? (process.env.CARD_MSG || undefined);
}

function localTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/** Headline for the text card when there is no custom message: a quote for
 *  the phase pair (quotes.json), falling back to the raw stage labels. */
function sharedLightTitle(a: Stage, b: Stage): string {
  return quoteFor(phaseOf(a), phaseOf(b)) ?? `${STAGE_LABEL[a]} · ${STAGE_LABEL[b]}`;
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

/** Text-card summary sent alongside the image (device /text content slot). */
export interface TextPayload {
  title: string;
  message?: string;
  signature: string;
}

/** Resolved card state shared by the image and canvas renderers. */
export interface CardData {
  msg?: string;
  cols: Column[];
  footer: string;
  quote: string;
}

/** Resolve message, weather columns, footer date and the phase quote. */
export async function collect(now: Date): Promise<CardData> {
  const msg = await resolveMessage();
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
      frame: 0,
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

  const quote = sharedLightTitle(cols[0].stage, cols[1].stage);
  return { msg, cols, footer, quote };
}

/** Render one frame; returns both the PNG and the text-card payload. */
export async function buildFrameAndText(
  frame: number,
  now: Date,
): Promise<{ png: Buffer; text: TextPayload }> {
  const { msg, cols, footer, quote } = await collect(now);

  const a = cols[0];
  const b = cols[1];
  // weather moves to the signature (small print) so the message body stays
  // short — long bodies make the device truncate the headline
  const weatherSig =
    `${a.name} ${a.tempC != null ? Math.round(a.tempC) : '--'}° ${
      STAGE_LABEL[a.stage]
    } · ${b.name} ${b.tempC != null ? Math.round(b.tempC) : '--'}° ${STAGE_LABEL[b.stage]}`;
  const text: TextPayload = {
    // headline: always the light-phase quote (random variant)
    title: quote,
    ...(msg ? { message: msg } : {}),
    signature: `${weatherSig} · ${footer}`,
  };

  let png: Buffer;
  if (STYLE === 'columns') {
    png = renderCard(cols, 296, 152, footer);
  } else {
    const a = sampleDay(PLACES[0], now);
  const b = sampleDay(PLACES[1], now);
  const goldenA = goldenIntervals(a);
  const goldenB = goldenIntervals(b);
  const fmt = (ivs: Array<[number, number]>) =>
    ivs.map(([s, e]) => `${s.toFixed(1)}\u2013${e.toFixed(1)}`).join(', ') || 'none';
  console.log(`golden hours — ${a.place.name}: ${fmt(goldenA)} | ${b.place.name}: ${fmt(goldenB)}`);

  png = renderSharedCard(
    {
      a,
      b,
      goldenA,
      goldenB,
      tempA: cols[0].tempC,
      tempB: cols[1].tempC,
      codeA: cols[0].code,
      codeB: cols[1].code,
      stageA: cols[0].stage,
      stageB: cols[1].stage,
      msg,
      footer,
      axisOffsetH: tzOffsetHours(PLACES[0].tz, now),
      frame,
    },
    296,
    152,
  );
  }

  return { png, text };
}

/** Render one frame as a colour PNG buffer. */
export async function buildFrame(frame: number, now: Date): Promise<Buffer> {
  return (await buildFrameAndText(frame, now)).png;
}

/** Render one frame and threshold it to pure 1-bit for the device. */
export async function buildBitFrame(frame: number, now: Date): Promise<Buffer> {
  const png = await buildFrame(frame, now);
  return sharp(png).greyscale().threshold(150).png().toBuffer();
}

/** Plot only — no baked text — for embedding in a canvas card. With
 *  `geometryOnly` the image is just curves/bands/marks: even the axis labels
 *  are left to the canvas, and the plot stretches over the given height. */
export async function buildBarePlot(
  now: Date,
  opts: { geometryOnly?: boolean; height?: number } = {},
): Promise<Buffer> {
  const { msg, cols } = await collect(now);
  const a = sampleDay(PLACES[0], now);
  const b = sampleDay(PLACES[1], now);
  const png = renderSharedCard(
    {
      a,
      b,
      goldenA: goldenIntervals(a),
      goldenB: goldenIntervals(b),
      tempA: cols[0].tempC,
      tempB: cols[1].tempC,
      codeA: cols[0].code,
      codeB: cols[1].code,
      stageA: cols[0].stage,
      stageB: cols[1].stage,
      msg,
      footer: '',
      axisOffsetH: tzOffsetHours(PLACES[0].tz, now),
      frame: 0,
      bare: true,
      geometryOnly: opts.geometryOnly,
    },
    296,
    opts.height ?? 152,
  );
  return sharp(png).greyscale().threshold(150).png().toBuffer();
}
