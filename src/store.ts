import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** One of the two places shown on the card (IANA timezone id). */
export interface Place {
  name: string;
  lat: number;
  lon: number;
  tz: string;
}

/**
 * Default places. Runtime overrides live in the persisted state file and are
 * applied onto this array on load; change them with `POST /location/1|2`.
 */
export const PLACES: Place[] = [
  { name: 'JAKARTA', lat: -6.2088, lon: 106.8456, tz: 'Asia/Jakarta' },
  { name: 'KYOTO UJI', lat: 34.8893, lon: 135.8048, tz: 'Asia/Tokyo' },
];

/**
 * Persistent runtime state for the little API: the current push message (plus a
 * short history) and any location overrides. Everything lives in one JSON file
 * so there is a single writer — set `STATE_FILE` (default state/message.json);
 * an empty value keeps it in memory only.
 */

const STATE_FILE = process.env.STATE_FILE ?? 'state/message.json';

/** Default lifetime of a posted message, in seconds (0 = never expires). */
const MESSAGE_TTL_S =
  process.env.MESSAGE_TTL === undefined
    ? 259200 // 3 days
    : Math.max(0, Number(process.env.MESSAGE_TTL));

/** How many history entries to keep on disk. */
const HISTORY_MAX = Math.max(0, Number(process.env.MESSAGE_HISTORY ?? 50));

/** How many recent entries `/stats` shows. */
export const STATS_HISTORY = Math.max(0, Number(process.env.MESSAGE_HISTORY_STATS ?? 10));

export interface StoredMessage {
  message: string;
  receivedAt: string; // ISO 8601
  source: 'post';
  /** Per-message override of the default TTL, in seconds. */
  ttlSeconds?: number;
}

interface State {
  message?: StoredMessage;
  history: StoredMessage[];
  locations?: Place[];
}

let state: State = { history: [] };

/** Absolute expiry (ms) of a message, or undefined when it never expires. */
function expiryMs(m: StoredMessage): number | undefined {
  const ttl = m.ttlSeconds ?? MESSAGE_TTL_S;
  if (ttl === 0) return undefined;
  return new Date(m.receivedAt).getTime() + ttl * 1000;
}

function persist(): void {
  if (!STATE_FILE) return;
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, STATE_FILE); // atomic swap
  } catch (err) {
    console.warn('state persist failed:', err instanceof Error ? err.message : err);
  }
}

/** Load persisted state and apply any location overrides onto PLACES. */
export function loadState(): void {
  if (!STATE_FILE) return;
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Partial<State>;
    state = {
      message: parsed.message,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      locations: parsed.locations,
    };
    if (Array.isArray(parsed.locations)) {
      parsed.locations.slice(0, PLACES.length).forEach((p, i) => {
        if (p && typeof p.lat === 'number' && typeof p.lon === 'number' && p.tz) {
          PLACES[i] = p;
        }
      });
    }
  } catch {
    /* no state file yet — keep defaults */
  }
}

/** Current message, or undefined when unset/expired (callers fall through). */
export function getMessage(): string | undefined {
  const m = state.message;
  if (!m) return undefined;
  const exp = expiryMs(m);
  if (exp !== undefined && Date.now() > exp) return undefined;
  return m.message;
}

/** Set the current message; logs it to history and persists. */
export function setMessage(message: string, ttlSeconds?: number): StoredMessage {
  const entry: StoredMessage = {
    message,
    receivedAt: new Date().toISOString(),
    source: 'post',
    ...(ttlSeconds !== undefined ? { ttlSeconds } : {}),
  };
  state.message = entry;
  if (HISTORY_MAX > 0) {
    state.history.push(entry);
    if (state.history.length > HISTORY_MAX) {
      state.history = state.history.slice(-HISTORY_MAX);
    }
  }
  persist();
  return entry;
}

/** Clear the current message (history is kept). */
export function clearMessage(): void {
  state.message = undefined;
  persist();
}

/** Replace one of the two places (0-based) and persist. */
export function setLocation(index: number, place: Place): Place {
  PLACES[index] = place;
  state.locations = PLACES.map((p) => ({ ...p }));
  persist();
  return place;
}

export interface StoreStats {
  message:
    | {
        current: string;
        receivedAt: string;
        source: string;
        expiresAt: string | null;
        active: boolean;
        count: number;
      }
    | null;
  recent: StoredMessage[];
  locations: Place[];
}

/** Stats snapshot: current message, the most recent `recent` posts, locations. */
export function stats(recent = STATS_HISTORY): StoreStats {
  const m = state.message;
  let message: StoreStats['message'] = null;
  if (m) {
    const exp = expiryMs(m);
    message = {
      current: m.message,
      receivedAt: m.receivedAt,
      source: m.source,
      expiresAt: exp !== undefined ? new Date(exp).toISOString() : null,
      active: getMessage() !== undefined,
      count: state.history.length,
    };
  }
  return {
    message,
    recent: state.history.slice(-recent).reverse(),
    locations: PLACES.map((p) => ({ ...p })),
  };
}

// Apply persisted overrides as soon as the module is imported.
loadState();
