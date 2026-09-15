/**
 * The two places shown on the card. This is the ONLY place coordinates live,
 * so swapping to GPS (Shortcuts) or Home Assistant later is a one-file change.
 */
export interface Place {
  name: string;
  lat: number;
  lon: number;
  tz: string; // IANA timezone id
}

export const PLACES: Place[] = [
  { name: 'JAKARTA', lat: -6.2088, lon: 106.8456, tz: 'Asia/Jakarta' },
  { name: 'KYOTO UJI', lat: 34.8893, lon: 135.8048, tz: 'Asia/Tokyo' },
];