import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { drawIcon, drawWeatherIcon } from './icons.js';
import { STAGE_LABEL, type Stage } from './stage.js';
import {
  elevationAtHour,
  GOLD_HI,
  GOLD_LO,
  NOW_H,
  STEP_MIN,
  WINDOW_H,
  fmtOffset,
  type CityPath,
} from './sunpath.js';

let FAMILY = 'sans-serif';
let FAMILY_BOLD = 'sans-serif';

/**
 * Register explicit font files so text renders on NixOS (Skia has no default
 * font path there). Paths come from devenv via CARD_FONT / CARD_FONT_BOLD.
 */
export function setupFonts(): void {
  const regular = process.env.CARD_FONT;
  const bold = process.env.CARD_FONT_BOLD;
  if (regular) {
    try {
      GlobalFonts.registerFromPath(regular, 'CardSans');
      FAMILY = 'CardSans';
    } catch {
      /* keep fallback */
    }
  }
  if (bold) {
    try {
      GlobalFonts.registerFromPath(bold, 'CardSansBold');
      FAMILY_BOLD = 'CardSansBold';
    } catch {
      /* keep fallback */
    }
  }
}

function fontPx(px: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${px}px ${bold ? FAMILY_BOLD : FAMILY}`;
}

export interface Column {
  name: string;
  time: string;
  stage: Stage;
  tempC: number | null;
  code: number; // WMO weather code, -1 = no data
  frame: number;
}

/** Compose the full 296x152 card and return a PNG buffer. */
export function renderCard(cols: Column[], width = 296, height = 152, footer?: string): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as SKRSContext2D;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.textBaseline = 'alphabetic';

  const gap = 6;
  const colW = (width - gap * 3) / 2;
  const bodyH = footer ? height - 18 : height;

  // centre divider
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2, 6);
  ctx.lineTo(width / 2, bodyH - 4);
  ctx.stroke();

  cols.slice(0, 2).forEach((c, i) => {
    const x = gap + i * (colW + gap);

    ctx.textAlign = 'left';
    ctx.font = fontPx(12, true);
    ctx.fillText(c.name, x, 14);

    ctx.textAlign = 'right';
    ctx.font = fontPx(12, true);
    ctx.fillText(c.time, x + colW, 14);

    const cx = x + colW / 2;
    const iconY = bodyH * 0.44;
    drawIcon(ctx, c.stage, cx, iconY, 38, c.frame);

    ctx.textAlign = 'center';
    ctx.font = fontPx(11, true);
    ctx.fillText(STAGE_LABEL[c.stage], cx, iconY + 32);

    if (c.tempC != null) {
      ctx.font = fontPx(16, true);
      ctx.fillText(`${Math.round(c.tempC)}\u00B0`, cx, bodyH - 3);
    }
  });

  if (footer) {
    ctx.textAlign = 'center';
    ctx.font = fontPx(10);
    ctx.fillText(footer, width / 2, height - 4);
  }

  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// "Shared sun" canvas: one 24h UTC axis, both cities' sun paths overlaid.
// ---------------------------------------------------------------------------

const X0 = 8; // plot left
const X1 = 288; // plot right (full width below the title bar)
let Y_TOP = 38; // plot top (= E_MAX elevation)
let Y_BOT = 122; // plot bottom (= E_MIN elevation)
const E_MIN = -30;
const E_MAX = 90;

export interface SharedInput {
  a: CityPath; // solid curve
  b: CityPath; // dashed curve
  goldenA: Array<[number, number]>; // city A's golden-hour windows
  goldenB: Array<[number, number]>; // city B's golden-hour windows
  tempA: number | null;
  tempB: number | null;
  codeA: number; // WMO weather code, -1 = no data
  codeB: number;
  stageA: Stage;
  stageB: Stage;
  /** Custom message drawn at the right of the title bar (e.g. "good morning :)"). */
  msg?: string;
  footer: string;
  /** Axis labels are shown in this timezone's local clock (offset vs UTC, e.g. +7). */
  axisOffsetH: number;
  frame: number;
  /** Bare mode: skip the title bar and footer; the plot stretches to fill. */
  bare?: boolean;
  /** Geometry-only: tick marks stay, labels are omitted (canvas draws them). */
  geometryOnly?: boolean;
  /** Axis labels as signed hours from now ("-6", "now", "+8") instead of clock time. */
  relAxis?: boolean;
}

/** Compose the 296x152 shared-sun card and return a PNG buffer. */
export function renderSharedCard(inp: SharedInput, width = 296, height = 152): Buffer {
  if (inp.bare) {
    // no title bar / footer: the plot stretches over the whole area
    if (inp.geometryOnly) {
      // axis labels are drawn by the canvas below the image — leave only a
      // strip for the tick marks themselves
      Y_TOP = 6;
      Y_BOT = height - 14;
    } else {
      Y_TOP = 8;
      Y_BOT = 130;
    }
  } else {
    Y_TOP = 38;
    Y_BOT = 122;
  }
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as SKRSContext2D;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.textBaseline = 'alphabetic';

  const px = (h: number) => X0 + (h / WINDOW_H) * (X1 - X0);
  const py = (e: number) =>
    Y_BOT - ((Math.min(Math.max(e, E_MIN), E_MAX) - E_MIN) / (E_MAX - E_MIN)) * (Y_BOT - Y_TOP);

  // golden-hour bands: each city gets its own hatch pattern; overlaps stack
  // into a crosshatch (both cities in golden hour at once)
  for (const [s, e] of inp.goldenA) {
    const bx = px(s);
    const bw = px(e) - bx;
    if (bw >= 1) ditherRect(ctx, bx, Y_TOP, bw, Y_BOT - Y_TOP, 'dots');
  }
  for (const [s, e] of inp.goldenB) {
    const bx = px(s);
    const bw = px(e) - bx;
    if (bw >= 1) ditherRect(ctx, bx, Y_TOP, bw, Y_BOT - Y_TOP, 'diag');
  }

  // horizon
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X0, py(0));
  ctx.lineTo(X1, py(0));
  ctx.stroke();

  // sun paths
  drawCurve(ctx, inp.a, px, py, false);
  drawCurve(ctx, inp.b, px, py, true);

  // label the widest golden-hour band, naming the city/cities it belongs to
  const union = mergeIntervals([...inp.goldenA, ...inp.goldenB]);
  const band = union.reduce<[number, number] | null>(
    (m, iv) => (m == null || iv[1] - iv[0] > m[1] - m[0] ? iv : m),
    null,
  );
  if (band && px(band[1]) - px(band[0]) >= 56) {
    const inA = inp.goldenA.some(([s, e]) => s < band[1] && e > band[0]);
    const inB = inp.goldenB.some(([s, e]) => s < band[1] && e > band[0]);
    const label =
      inA && inB
        ? 'golden hour'
        : inA
          ? `${inp.a.place.name} golden`
          : inB
            ? `${inp.b.place.name} golden`
            : 'golden hour';
    ctx.font = fontPx(9);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    const lw = ctx.measureText(label).width;
    const cx = px((band[0] + band[1]) / 2);
    ctx.fillRect(cx - lw / 2 - 3, py(0) + 3, lw + 6, 10);
    ctx.fillStyle = '#000';
    ctx.fillText(label, cx, py(0) + 11);
  }

  // now-line: fixed 1/3 of the way across (window = NOW_H back, rest ahead)
  ctx.setLineDash([1, 3]);
  ctx.beginPath();
  ctx.moveTo(px(NOW_H), Y_TOP);
  ctx.lineTo(px(NOW_H), Y_BOT);
  ctx.stroke();
  ctx.setLineDash([]);

  // the two suns, right now (hollow marker = below the horizon)
  const eA = elevationAtHour(inp.a, NOW_H);
  const eB = elevationAtHour(inp.b, NOW_H);
  drawSunDot(ctx, px(NOW_H), py(eA), false, eA < 0, inp.frame);
  drawSunDot(ctx, px(NOW_H), py(eB), true, eB < 0, inp.frame);

  // axis ticks every 2h, anchored ON "now" so the now-line hits a tick
  ctx.font = fontPx(10);
  ctx.textAlign = 'center';
  const startH = inp.a.startH;
  const nowH = startH + NOW_H;
  const kMin = Math.ceil((startH - nowH) / 2);
  for (let k = kMin; ; k++) {
    const hAbs = nowH + k * 2;
    if (hAbs > startH + WINDOW_H + 1e-9) break;
    const x = px(hAbs - startH);
    ctx.beginPath();
    ctx.moveTo(x, Y_BOT);
    ctx.lineTo(x, Y_BOT + 3);
    ctx.stroke();
    const clockH = Math.round(((((hAbs + inp.axisOffsetH) % 24) + 24) % 24));
    if (x < X1 - 10 && !inp.geometryOnly) {
      const label = inp.relAxis
        ? fmtOffset(Math.round(hAbs - nowH))
        : String(clockH % 24).padStart(2, '0');
      ctx.fillText(label, x, Y_BOT + 13);
    }
  }

  // title bar: one row per city (chip, name, temp, weather, condition),
  // custom message space on the right
  if (!inp.bare) drawTitleBar(ctx, inp);

  // footer: date, centred under the plot
  if (!inp.bare) {
    ctx.font = fontPx(10);
    ctx.textAlign = 'center';
    ctx.fillText(inp.footer, (X0 + X1) / 2, height - 3);
  }

  return canvas.toBuffer('image/png');
}

function drawCurve(
  ctx: SKRSContext2D,
  p: CityPath,
  px: (h: number) => number,
  py: (e: number) => number,
  dashed: boolean,
): void {
  const end = p.elev.length - 1; // window is exactly 24h of samples
  const pt = (i: number) => ({ x: px(i * (STEP_MIN / 60)), y: py(p.elev[i]) });

  const strokeSeg = (i0: number, i1: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    const a = pt(i0);
    ctx.moveTo(a.x, a.y);
    for (let i = i0 + 1; i <= i1; i++) {
      const q = pt(i);
      ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  };

  ctx.setLineDash(dashed ? [3, 3] : []);
  strokeSeg(0, end, 1.25);

  // golden-hour stretches drawn extra thick (keep dash identity of each city)
  let i = 0;
  while (i < end) {
    if (p.elev[i] >= GOLD_LO && p.elev[i] < GOLD_HI) {
      let j = i;
      while (j < end && p.elev[j] >= GOLD_LO && p.elev[j] < GOLD_HI) j++;
      strokeSeg(Math.max(i - 1, 0), Math.min(j, end), 3.5);
      i = j;
    } else {
      i++;
    }
  }
  ctx.setLineDash([]);
}

function drawSunDot(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  dashed: boolean,
  below: boolean,
  frame: number,
): void {
  ctx.lineWidth = 1.25;
  if (below) {
    // below the horizon: small marker matching the city's line style, no rays
    ctx.setLineDash(dashed ? [2, 2] : []);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  // above the horizon: filled disk + rotating rays (frame animation)
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  const rays = 8;
  const off = frame * ((Math.PI * 2) / (rays * 2));
  for (let i = 0; i < rays; i++) {
    const a = off + i * ((Math.PI * 2) / rays);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5);
    ctx.lineTo(x + Math.cos(a) * 7.5, y + Math.sin(a) * 7.5);
    ctx.stroke();
  }
}

function drawTitleBar(ctx: SKRSContext2D, inp: SharedInput): void {
  const endA = drawCityLine(ctx, 8, 13, inp.a.place.name, false, inp.tempA, inp.codeA, inp.stageA);
  const endB = drawCityLine(ctx, 8, 28, inp.b.place.name, true, inp.tempB, inp.codeB, inp.stageB);
  if (inp.msg) {
    // largest single-line font that fits between the city rows and the right
    // edge; if even 10px overflows, stack the message on two 9px lines; if
    // THAT overflows too, ellipsize rather than overlap the city rows
    const msg = inp.msg;
    const avail = 288 - Math.max(endA, endB) - 6;
    const px = [14, 13, 12, 11, 10].find((p) => {
      ctx.font = fontPx(p, true);
      return ctx.measureText(msg).width <= avail;
    });
    ctx.textAlign = 'right';
    if (px) {
      ctx.font = fontPx(px, true);
      ctx.fillText(msg, 288, 24);
    } else {
      ctx.font = fontPx(9, true);
      const [l1, l2] = wrapTwo(msg, avail, ctx);
      ctx.fillText(l1, 288, 16);
      ctx.fillText(l2, 288, 29);
    }
    ctx.textAlign = 'left';
  }
  // separator under the bar
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X0, 33);
  ctx.lineTo(X1, 33);
  ctx.stroke();
}

function drawCityLine(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  name: string,
  dashed: boolean,
  tempC: number | null,
  code: number,
  stage: Stage,
): number {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#000';
  ditherRect(ctx, x, y - 8, 12, 6, dashed ? 'diag' : 'dots');
  ctx.font = fontPx(11, true);
  ctx.fillText(name, x + 16, y);
  let cx = x + 16 + ctx.measureText(name).width + 4;
  ctx.font = fontPx(11);
  if (tempC != null) {
    const t = `${Math.round(tempC)}\u00B0`;
    ctx.fillText(t, cx, y);
    cx += ctx.measureText(t).width + 4;
  }
  if (code >= 0) {
    drawWeatherIcon(ctx, code, cx + 5.5, y - 4, 11);
    cx += 15;
  }
  ctx.font = fontPx(9, true);
  ctx.fillText(STAGE_LABEL[stage], cx, y);
  return cx + ctx.measureText(STAGE_LABEL[stage]).width;
}

type Pattern = 'dots' | 'diag';

/** Split `msg` into two balanced lines each no wider than `avail`; ellipsizes
 *  a line if a single word alone still overflows. */
function wrapTwo(msg: string, avail: number, ctx: SKRSContext2D): [string, string] {
  const words = msg.trim().split(/\s+/);
  if (words.length === 1) return [ellipsize(msg, avail, ctx), ''];
  let best: [string, string] = [msg, ''];
  let bestMax = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (m < bestMax) {
      bestMax = m;
      best = [a, b];
    }
  }
  return [ellipsize(best[0], avail, ctx), ellipsize(best[1], avail, ctx)];
}

function ellipsize(s: string, avail: number, ctx: SKRSContext2D): string {
  if (ctx.measureText(s).width <= avail) return s;
  while (s.length > 1 && ctx.measureText(s + '\u2026').width > avail) {
    s = s.slice(0, -1);
  }
  return s.replace(/[\s,.;:!?-]+$/, '') + '\u2026';
}

/** Hatch fills, snapped to integer pixels (fractional coords + 1px rects
 *  anti-alias into a solid blob the e-ink threshold renders as pure black). */
function ditherRect(
  ctx: SKRSContext2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  pattern: Pattern,
): void {
  const x = Math.round(x0);
  const ww = Math.max(1, Math.round(w));
  ctx.fillStyle = '#000';
  if (pattern === 'dots') {
    // sparse axis-aligned dot grid, ~25% — city A
    for (let yy = 0; yy < h; yy += 2) {
      for (let xx = 0; xx < ww; xx += 2) {
        ctx.fillRect(x + xx, y0 + yy, 1, 1);
      }
    }
  } else {
    // fine 45° hatch, ~25% — city B
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < ww; xx++) {
        if ((x + xx + yy) % 4 === 0) ctx.fillRect(x + xx, y0 + yy, 1, 1);
      }
    }
  }
}

function mergeIntervals(ivs: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ivs].sort((x, y) => x[0] - y[0]);
  const merged: Array<[number, number]> = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return merged;
}