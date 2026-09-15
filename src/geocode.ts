import type { Place } from './store.js';

/**
 * Fuzzy place lookup via Open-Meteo's geocoding API (GeoNames data, no key):
 *   https://geocoding-api.open-meteo.com/v1/search?name=Kyoto&count=5&format=json
 * Matching is normalized-prefix and diacritic-insensitive; a "City, Country or
 * State" qualifier narrows the results.
 */

const GEOCODE_URL =
  process.env.GEOCODE_URL ?? 'https://geocoding-api.open-meteo.com/v1/search';

export interface GeoCandidate {
  name: string;
  lat: number;
  lon: number;
  tz: string;
  country?: string;
  admin1?: string;
  population?: number;
}

interface RawResult {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country?: string;
  admin1?: string;
  population?: number;
}

/** Search candidates for a free-text query. Throws on network/API failure. */
export async function searchPlaces(query: string, count = 5): Promise<GeoCandidate[]> {
  const url =
    `${GEOCODE_URL}?name=${encodeURIComponent(query)}` +
    `&count=${count}&language=en&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`);
  const json = (await res.json()) as { results?: RawResult[] };
  return (json.results ?? []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone,
    ...(r.country ? { country: r.country } : {}),
    ...(r.admin1 ? { admin1: r.admin1 } : {}),
    ...(r.population != null ? { population: r.population } : {}),
  }));
}

/** Best match for a query as a card `Place` (name uppercased to match the card). */
export async function bestPlace(query: string): Promise<Place | null> {
  const [hit] = await searchPlaces(query, 1);
  if (!hit) return null;
  return { name: hit.name.toUpperCase(), lat: hit.lat, lon: hit.lon, tz: hit.tz };
}
