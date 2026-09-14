import SunCalc from 'suncalc';
import type { Place } from './locations.js';

export const STAGES = [
  'night',
  'twilight',
  'dawnGolden',
  'morning',
  'noon',
  'afternoon',
  'eveningGolden',
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  night: 'Night',
  twilight: 'Twilight',
  dawnGolden: 'Dawn golden',
  morning: 'Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  eveningGolden: 'Dusk golden',
};

/** Sun elevation above the horizon, in degrees. */
export function elevationDeg(date: Date, p: Place): number {
  return SunCalc.getPosition(date, p.lat, p.lon).altitude * (180 / Math.PI);
}

export interface SunInfo {
  stage: Stage;
  elevation: number;
  solarNoon: Date;
  sunrise: Date;
  sunset: Date;
}

/**
 * Stage rules (sun elevation `e`, plus solar-noon proximity for the day split):
 *   e <  -6            -> night
 *   -6 <= e < -4       -> twilight
 *   -4 <= e <  6       -> golden hour (dawn before solar noon, dusk after)
 *   e >= 6             -> morning / noon / afternoon (noon = solarNoon +/- 90min)
 */
export function sunInfo(date: Date, p: Place): SunInfo {
  const t = SunCalc.getTimes(date, p.lat, p.lon);
  const e = elevationDeg(date, p);
  const noonMs = t.solarNoon.getTime();

  let stage: Stage;
  if (e >= 6) {
    const dt = date.getTime() - noonMs;
    stage = Math.abs(dt) <= 90 * 60 * 1000 ? 'noon' : dt < 0 ? 'morning' : 'afternoon';
  } else if (e >= -4) {
    stage = date.getTime() < noonMs ? 'dawnGolden' : 'eveningGolden';
  } else if (e >= -6) {
    stage = 'twilight';
  } else {
    stage = 'night';
  }

  return { stage, elevation: e, solarNoon: t.solarNoon, sunrise: t.sunrise, sunset: t.sunset };
}