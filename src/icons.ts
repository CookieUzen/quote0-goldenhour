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