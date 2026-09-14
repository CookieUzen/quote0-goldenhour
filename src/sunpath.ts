import SunCalc from 'suncalc';
import type { Place } from './locations.js';

/**
 * Data for the "shared sun" canvas: both cities' solar elevation sampled over
 * a sliding 24h window that is always centred on "now" (12h either side), so
 * the current moment is fixed at the middle of the card and the curve scrolls
 * leftward as the day progresses.
 *
 * Window hours are relative to the window start ([0, 24]); `startH` records
 * where the window begins in absolute UTC hours (relative to that UTC day's
 * midnight, may be negative) so axis ticks can show true UTC clock hours.
 */

export const STEP_MIN = 5;
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
 * Sample the sun's elevation over the 24h window centred on `now`
 * (i.e. from now - halfHours to now + halfHours).
 */
export function sampleDay(place: Place, now: Date, halfHours = 12): CityPath {
  const dayStart = utcDayStart(now);
  const startH = nowHours(now, dayStart) - halfHours;
  const startMs = dayStart.getTime() + startH * 3_600_000;
  const count = (24 * 60) / STEP_MIN + 1;
  const elev: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const t = new Date(startMs + i * STEP_MIN * 60_000);
    elev[i] = SunCalc.getPosition(t, place.lat, place.lon).altitude * (180 / Math.PI);
  }
  return { place, dayStart, startH, elev };
}

/** Linearly-interpolated elevation at window-relative hour `h` in [0, 24]. */
export function elevationAtHour(p: CityPath, h: number): number {
  const x = Math.min(Math.max(h, 0), 24) / H_PER_STEP;
  const i = Math.min(Math.floor(x), p.elev.length - 2);
  const f = x - i;
  return p.elev[i] * (1 - f) + p.elev[i + 1] * f;
}

/**
 * Window-hour intervals [start, end) within [0, 24] where BOTH cities are
 * above the horizon simultaneously.
 */
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
