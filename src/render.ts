import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { drawIcon, drawWeatherIcon } from './icons.js';
import { STAGE_LABEL, type Stage } from './stage.js';
import { elevationAtHour, GOLD_HI, GOLD_LO, STEP_MIN, type CityPath } from './sunpath.js';

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

const X0 = 10; // plot left
const X1 = 286; // plot right
const Y_TOP = 34; // plot top (= E_MAX elevation)
const Y_BOT = 126; // plot bottom (= E_MIN elevation)
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
  footer: string;
  /** Axis labels are shown in this timezone's local clock (offset vs UTC, e.g. +7). */
  axisOffsetH: number;
  frame: number;
}

/** Compose the 296x152 shared-sun card and return a PNG buffer. */
export function renderSharedCard(inp: SharedInput, width = 296, height = 152): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as SKRSContext2D;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.textBaseline = 'alphabetic';

  const px = (h: number) => X0 + (h / 24) * (X1 - X0);
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

  // now-line: always the exact centre of the card (window is centred on now)
  ctx.setLineDash([1, 3]);
  ctx.beginPath();
  ctx.moveTo(px(12), Y_TOP);
  ctx.lineTo(px(12), Y_BOT);
  ctx.stroke();
  ctx.setLineDash([]);

  // the two suns, right now (hollow marker = below the horizon)
  const eA = elevationAtHour(inp.a, 12);
  const eB = elevationAtHour(inp.b, 12);
  drawSunDot(ctx, px(12), py(eA), false, eA < 0, inp.frame);
  drawSunDot(ctx, px(12), py(eB), true, eB < 0, inp.frame);

  // axis ticks at true UTC clock hours (every 3h within the window)
  ctx.font = fontPx(10);
  ctx.textAlign = 'center';
  const startH = inp.a.startH;
  const firstTick = Math.ceil(startH / 3) * 3;
  for (let i = 0; i <= 9; i++) {
    const hAbs = firstTick + i * 3;
    if (hAbs > startH + 24 + 1e-9) break;
    const x = px(hAbs - startH);
    ctx.beginPath();
    ctx.moveTo(x, Y_BOT);
    ctx.lineTo(x, Y_BOT + 3);
    ctx.stroke();
    const clockH = Math.round(((((hAbs + inp.axisOffsetH) % 24) + 24) % 24));
    ctx.fillText(String(clockH % 24).padStart(2, '0'), x, Y_BOT + 13);
  }

  // city tags: [swatch] NAME  temp  [weather] — place 0 left, place 1 right.
  // Long names (e.g. JAKARTA + HONG KONG) don't both fit at full size, so pick
  // the largest tag font that keeps the two tags on one line.
  const margin = 16;
  const tagPx =
    [14, 13, 12, 11, 10].find(
      (px) =>
        tagWidth(ctx, px, inp.a.place.name, inp.tempA != null, inp.codeA >= 0) +
          tagWidth(ctx, px, inp.b.place.name, inp.tempB != null, inp.codeB >= 0) <=
        width - margin,
    ) ?? 10;
  drawCityTag(ctx, 8, inp.a.place.name, inp.tempA, inp.codeA, false, false, tagPx);
  drawCityTag(ctx, width - 8, inp.b.place.name, inp.tempB, inp.codeB, true, true, tagPx);

  // footer: date, bottom-left
  ctx.font = fontPx(10);
  ctx.textAlign = 'left';
  ctx.fillText(inp.footer, 8, height - 3);

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

function tagWidth(
  ctx: SKRSContext2D,
  px: number,
  name: string,
  hasTemp: boolean,
  hasIcon: boolean,
): number {
  const swatchW = 16;
  const gap = 6;
  ctx.font = fontPx(px, true);
  let w = swatchW + gap + ctx.measureText(name).width;
  if (hasTemp) {
    ctx.font = fontPx(px);
    w += gap + ctx.measureText('00\u00B0').width;
  }
  if (hasIcon) w += gap + 13;
  return w;
}

function drawCityTag(
  ctx: SKRSContext2D,
  edgeX: number,
  name: string,
  tempC: number | null,
  code: number,
  rightAlign: boolean,
  dashed: boolean,
  px: number,
): void {
  const swatchW = 16;
  const gap = 6;
  const y = 16;
  const iconS = 13;
  const hasIcon = code >= 0;

  ctx.font = fontPx(px, true);
  const nameW = ctx.measureText(name).width;
  const info = tempC != null ? `${Math.round(tempC)}\u00B0` : '';
  ctx.font = fontPx(px);
  const infoW = ctx.measureText(info).width;
  const total =
    swatchW + gap + nameW + (info ? gap + infoW : 0) + (hasIcon ? gap + iconS : 0);

  let x = rightAlign ? edgeX - total : edgeX;

  // line-style swatch over the city's hatch pattern so the tag can be matched
  // to its curve AND its golden-hour band
  ctx.lineWidth = 2;
  ctx.setLineDash(dashed ? [3, 2] : []);
  ditherRect(ctx, x, y - 9, swatchW, 7, dashed ? 'diag' : 'dots');
  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x + swatchW, y - 5);
  ctx.stroke();
  ctx.setLineDash([]);
  x += swatchW + gap;

  ctx.textAlign = 'left';
  ctx.font = fontPx(px, true);
  ctx.fillText(name, x, y);
  x += nameW + gap;
  if (info) {
    ctx.font = fontPx(px);
    ctx.fillText(info, x, y);
    x += infoW + gap;
  }
  if (hasIcon) {
    drawWeatherIcon(ctx, code, x + iconS / 2, y - 5, iconS);
  }
}

type Pattern = 'dots' | 'diag';

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