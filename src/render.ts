import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { drawIcon } from './icons.js';
import { STAGE_LABEL, type Stage } from './stage.js';

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