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
  { name: 'HONG KONG', lat: 22.3193, lon: 114.1694, tz: 'Asia/Hong_Kong' },
];