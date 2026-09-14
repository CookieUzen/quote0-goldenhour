import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Stage } from './stage.js';

/**
 * Draws a bold, 1-bit-friendly icon centred at (cx, cy).
 * `s` is the icon box size in px. `frame` rotates the sun rays, so the same
 * stage can be rendered as a tiny multi-frame animation.
 */
export function drawIcon(
  ctx: SKRSContext2D,
  stage: Stage,
  cx: number,
  cy: number,
  s: number,
  frame = 0,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  const R = s / 2;

  switch (stage) {
    case 'night':
      drawMoon(ctx, R);
      break;
    case 'twilight':
      drawTwilight(ctx, R);
      break;
    case 'dawnGolden':
      drawHorizonSun(ctx, R, frame, 'dawn');
      break;
    case 'eveningGolden':
      drawHorizonSun(ctx, R, frame, 'dusk');
      break;
    case 'morning':
      drawSun(ctx, R, frame, 8, R * 0.92);
      break;
    case 'noon':
      drawSun(ctx, R, frame, 12, R * 1.02);
      break;
    case 'afternoon':
      drawSun(ctx, R, frame, 8, R * 0.92);
      break;
  }
  ctx.restore();
}

function drawSun(ctx: SKRSContext2D, R: number, frame: number, rays: number, rayLen: number): void {
  const disk = R * 0.45;
  ctx.beginPath();
  ctx.arc(0, 0, disk, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2;
  const off = frame * ((Math.PI * 2) / (rays * 2));
  for (let i = 0; i < rays; i++) {
    const a = off + i * ((Math.PI * 2) / rays);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * disk * 1.45, Math.sin(a) * disk * 1.45);
    ctx.lineTo(Math.cos(a) * rayLen, Math.sin(a) * rayLen);
    ctx.stroke();
  }
}

function drawMoon(ctx: SKRSContext2D, R: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // carve the crescent by overpainting white
  ctx.beginPath();
  ctx.arc(R * 0.3, -R * 0.15, R * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = '#000';

  star(ctx, -R * 0.6, -R * 0.5, R * 0.12);
  star(ctx, R * 0.55, -R * 0.7, R * 0.09);
  star(ctx, R * 0.6, R * 0.35, R * 0.11);
}

function star(ctx: SKRSContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.lineTo(x - r, y + r);
  ctx.closePath();
  ctx.fill();
}

function drawTwilight(ctx: SKRSContext2D, R: number): void {
  for (let i = 0; i < 3; i++) {
    const y = -R * 0.75 + i * R * 0.32;
    ctx.beginPath();
    ctx.moveTo(-R * 0.9 + i * R * 0.12, y);
    ctx.lineTo(R * 0.9 - i * R * 0.12, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-R, R * 0.35);
  ctx.lineTo(R, R * 0.35);
  ctx.stroke();

  // sun mostly below the horizon
  ctx.beginPath();
  ctx.arc(0, R * 0.35, R * 0.4, Math.PI, Math.PI * 2);
  ctx.fill();
}

function drawHorizonSun(
  ctx: SKRSContext2D,
  R: number,
  frame: number,
  kind: 'dawn' | 'dusk',
): void {
  const hy = R * 0.4;
  ctx.beginPath();
  ctx.moveTo(-R, hy);
  ctx.lineTo(R, hy);
  ctx.stroke();

  const disk = R * 0.4;
  const cy = kind === 'dawn' ? hy - disk * 0.9 : hy - disk * 0.2;
  ctx.beginPath();
  ctx.arc(0, cy, disk, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2;
  const rays = 7;
  const off = frame * ((Math.PI * 2) / (rays * 2));
  for (let i = 0; i < rays; i++) {
    const a = -Math.PI + off + i * (Math.PI / rays);
    const r1 = disk * 1.4;
    const r2 = disk * 1.9;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Tiny 1-bit weather glyphs (WMO codes from Open-Meteo), for the city tags.
// ---------------------------------------------------------------------------

export type WeatherKind =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

export function weatherKind(code: number): WeatherKind {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
}

/**
 * Draws a small weather glyph centred at (cx, cy) inside an s×s box.
 * `code < 0` (no data) should not be passed here — callers check first.
 */
export function drawWeatherIcon(
  ctx: SKRSContext2D,
  code: number,
  cx: number,
  cy: number,
  s = 13,
): void {
  const kind = weatherKind(code);
  ctx.save();
  ctx.translate(cx - s / 2, cy - s / 2);
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.lineWidth = 1;

  switch (kind) {
    case 'clear': {
      const c = s / 2;
      const r = s * 0.24;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * (r + 1), c + Math.sin(a) * (r + 1));
        ctx.lineTo(c + Math.cos(a) * (r + 3.5), c + Math.sin(a) * (r + 3.5));
        ctx.stroke();
      }
      break;
    }
    case 'partly':
      // small sun peeking above the cloud, top-right
      ctx.beginPath();
      ctx.arc(s * 0.66, s * 0.3, s * 0.17, 0, Math.PI * 2);
      ctx.fill();
      cloudPath(ctx, s * 0.02, s * 0.8, s * 0.36);
      break;
    case 'cloudy':
      cloudPath(ctx, s * 0.05, s * 0.8, s * 0.42);
      break;
    case 'fog':
      for (let i = 0; i < 3; i++) {
        const y = s * (0.3 + i * 0.2);
        const ind = (i % 2) * 0.1;
        ctx.beginPath();
        ctx.moveTo(s * (0.08 + ind), y);
        ctx.lineTo(s * (0.92 - ind), y);
        ctx.stroke();
      }
      break;
    case 'drizzle':
    case 'rain': {
      cloudPath(ctx, s * 0.05, s * 0.6, s * 0.36);
      const n = kind === 'rain' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const x = s * (0.28 + i * 0.22);
        ctx.beginPath();
        ctx.moveTo(x, s * 0.72);
        ctx.lineTo(x - 1, s * 0.92);
        ctx.stroke();
      }
      break;
    }
    case 'snow':
      cloudPath(ctx, s * 0.05, s * 0.6, s * 0.36);
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(s * (0.26 + i * 0.24) - 0.75, s * 0.78, 1.5, 1.5);
      }
      break;
    case 'storm':
      cloudPath(ctx, s * 0.05, s * 0.56, s * 0.36);
      ctx.beginPath();
      ctx.moveTo(s * 0.55, s * 0.58);
      ctx.lineTo(s * 0.38, s * 0.82);
      ctx.lineTo(s * 0.49, s * 0.82);
      ctx.lineTo(s * 0.42, s * 1.0);
      ctx.lineTo(s * 0.62, s * 0.72);
      ctx.lineTo(s * 0.52, s * 0.72);
      ctx.closePath();
      ctx.fill();
      break;
  }
  ctx.restore();
}

/** Scallop-top cloud outline; bottom edge at `yb`, total width 2.8h. */
function cloudPath(ctx: SKRSContext2D, x: number, yb: number, h: number): void {
  const rS = h * 0.4;
  const rM = h * 0.6;
  ctx.beginPath();
  ctx.moveTo(x, yb);
  ctx.arc(x + rS, yb, rS, Math.PI, 0, false);
  ctx.arc(x + 2 * rS + rM, yb, rM, Math.PI, 0, false);
  ctx.arc(x + 2 * rS + 2 * rM + rS, yb, rS, Math.PI, 0, false);
  ctx.closePath();
  ctx.stroke();
}