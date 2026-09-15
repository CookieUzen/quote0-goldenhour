import SunCalc from 'suncalc';
import type { Place } from './store.js';

/**
 * Data for the "shared sun" canvas: both cities' solar elevation sampled over
 * a sliding 12h window with "now" fixed 1/3 of the way in (4h behind, 8h
 * ahead) — the recent past and the near future, not the whole day.
 *
 * Window hours are relative to the window start ([0, WINDOW_H]); `startH`
 * records where the window begins in absolute UTC hours (relative to that UTC
 * day's midnight, may be negative) so axis ticks can show true clock hours.
 */

export const STEP_MIN = 5;
export const WINDOW_H = 24; // total window width in hours
export const NOW_H = 8; // "now" position within the window (1/3 of 24h)
const H_PER_STEP = STEP_MIN / 60;

export interface CityPath {
  place: Place;
  /** UTC midnight of the day "now" falls in */
  dayStart: Date;
  /** window start in fractional UTC hours relative to dayStart (may be negative) */
  startH: number;
  /** Solar elevation (degrees) every STEP_MIN; index i = window hour i * H_PER_STEP. */
  elev: number[];
}

export function utcDayStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** `now` as fractional hours [0, 24) since the UTC day start. */
export function nowHours(now: Date, dayStart: Date): number {
  return ((now.getTime() - dayStart.getTime()) / 3_600_000 + 24) % 24;
}

/**
 * Sample the sun's elevation over the sliding window: NOW_H hours before
 * `now`, the rest after (12h total).
 */
export function sampleDay(place: Place, now: Date): CityPath {
  const dayStart = utcDayStart(now);
  const startH = nowHours(now, dayStart) - NOW_H;
  const startMs = dayStart.getTime() + startH * 3_600_000;
  const count = (WINDOW_H * 60) / STEP_MIN + 1;
  const elev: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const t = new Date(startMs + i * STEP_MIN * 60_000);
    elev[i] = SunCalc.getPosition(t, place.lat, place.lon).altitude * (180 / Math.PI);
  }
  return { place, dayStart, startH, elev };
}

/** Linearly-interpolated elevation at window-relative hour `h` in [0, WINDOW_H]. */
export function elevationAtHour(p: CityPath, h: number): number {
  const x = Math.min(Math.max(h, 0), WINDOW_H) / H_PER_STEP;
  const i = Math.min(Math.floor(x), p.elev.length - 2);
  const f = x - i;
  return p.elev[i] * (1 - f) + p.elev[i + 1] * f;
}

/** Elevation band that counts as golden hour (matches stage.ts's rule). */
export const GOLD_LO = -4;
export const GOLD_HI = 6;

function intervalsWhere(p: CityPath, lo: number, hi: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  for (let i = 0; i < p.elev.length; i++) {
    const inBand = p.elev[i] >= lo && p.elev[i] < hi;
    const h = i * H_PER_STEP;
    if (inBand && start === null) start = h;
    if (!inBand && start !== null) {
      out.push([start, h]);
      start = null;
    }
  }
  if (start !== null) out.push([start, (p.elev.length - 1) * H_PER_STEP]);
  return out.filter(([s, e]) => e - s >= H_PER_STEP);
}

/** This city's golden-hour windows (elevation in [GOLD_LO, GOLD_HI)), window hours. */
export function goldenIntervals(p: CityPath): Array<[number, number]> {
  return intervalsWhere(p, GOLD_LO, GOLD_HI);
}

/** Axis ticks for the plot: every 2h anchored ON "now" (so a `now` label
 *  always exists and sits under the now-line). `offset` is signed hours from
 *  now; `hour` is the window-relative hour, matching the marks in the image. */
export function axisTicks(now: Date): Array<{ hour: number; offset: number }> {
  const dayStart = utcDayStart(now);
  const startH = nowHours(now, dayStart) - NOW_H;
  const nowH = startH + NOW_H;
  const kMin = Math.ceil((startH - nowH) / 2);
  const ticks: Array<{ hour: number; offset: number }> = [];
  for (let k = kMin; ; k++) {
    const hAbs = nowH + k * 2;
    if (hAbs > startH + WINDOW_H + 1e-9) break;
    const hour = hAbs - startH;
    // mirror the image's right-edge guard (labels stop before x = X1 - 10)
    if (hour >= ((280 - 10) / 280) * WINDOW_H) break;
    ticks.push({ hour, offset: Math.round(hAbs - nowH) });
  }
  return ticks;
}

/** "+2", "-6", "now". */
export function fmtOffset(o: number): string {
  if (o === 0) return 'now';
  return o > 0 ? `+${o}` : `-${Math.abs(o)}`;
}
