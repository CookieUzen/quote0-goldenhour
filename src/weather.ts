import type { Place } from './locations.js';

export interface Weather {
  tempC: number;
  code: number;
}

/** Current temperature + WMO weather code from Open-Meteo (no API key). */
export async function fetchWeather(p: Place): Promise<Weather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
      `&current=temperature_2m,weather_code&timezone=${encodeURIComponent(p.tz)}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    if (j.current?.temperature_2m == null) return null;
    return { tempC: j.current.temperature_2m, code: j.current.weather_code ?? 0 };
  } catch {
    return null;
  }
}