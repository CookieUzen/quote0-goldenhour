import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { searchPlaces, type GeoCandidate } from './geocode.js';
import { PLACES, type Place } from './store.js';
import {
  STATS_HISTORY,
  clearMessage,
  getMessage,
  setLocation,
  setMessage,
  stats,
} from './store.js';

/**
 * Tiny control API for the golden-hour loop. Meant to sit behind Tailscale;
 * an optional `POST_TOKEN` adds a rudimentary shared-password layer on top.
 *
 *   POST   /message            set the current card message
 *   GET    /message            read it back
 *   DELETE /message            clear it (card falls through to CARD_MSG / quote)
 *   POST   /location/1|2       set a city by geocoded name or explicit coords
 *   GET    /location           both current places
 *   GET    /geocode?q=...      fuzzy city lookup (candidates)
 *   GET    /stats              message + recent history + locations + loop stats
 *   GET    /healthz            liveness
 */

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const TOKEN = process.env.POST_TOKEN || undefined;
const RATE_LIMIT_MS = Math.max(0, Number(process.env.RATE_LIMIT_MS ?? 1000));
const MAX_BODY = 4096;

let lastRequestAt = 0;

export interface ServerHooks {
  /** Called after a message is accepted (for an immediate device push). */
  onMessage?: (message: string) => void;
  /** Called after a location is changed (0-based index). */
  onLocation?: (index: number) => void;
  /** Extra loop telemetry merged into /stats. */
  loopStats?: () => Record<string, unknown>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function authorized(req: IncomingMessage): boolean {
  if (!TOKEN) return true;
  const auth = req.headers.authorization;
  const x = req.headers['x-post-token'];
  const provided =
    typeof auth === 'string' && auth.startsWith('Bearer ')
      ? auth.slice(7)
      : typeof x === 'string'
        ? x
        : '';
  return safeEqual(provided, TOKEN);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, `body larger than ${MAX_BODY} bytes`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Parse a message body: raw text, or JSON `{ message, ttlSeconds }`. */
function parseMessage(raw: string): { message: string; ttlSeconds?: number } | null {
  const text = raw.trim();
  if (!text) return null;
  if (!text.startsWith('{')) return { message: text };
  let json: { message?: unknown; ttlSeconds?: unknown };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }
  const message = String(json.message ?? '').trim();
  if (!message) return null;
  const ttlSeconds =
    json.ttlSeconds != null ? Math.max(0, Number(json.ttlSeconds)) : undefined;
  return { message, ...(ttlSeconds !== undefined ? { ttlSeconds } : {}) };
}

/**
 * Resolve a place from `{ query }` (geocoded — best match auto-picked, with the
 * full candidate list returned so a wrong choice can be corrected via `pick`) or
 * explicit `{ name, lat, lon, tz }`.
 */
async function resolvePlace(
  body: Record<string, unknown>,
): Promise<{ place: Place; candidates: GeoCandidate[] }> {
  if (body.lat != null && body.lon != null) {
    const tz = String(body.tz ?? 'UTC');
    return {
      place: {
        name: String(body.name ?? 'PLACE').toUpperCase(),
        lat: Number(body.lat),
        lon: Number(body.lon),
        tz,
      },
      candidates: [],
    };
  }
  const query = String(body.query ?? body.name ?? '').trim();
  if (!query) throw new HttpError(400, 'expected "query" (city name) or "lat"+"lon"');
  const candidates = await searchPlaces(query, 5);
  if (!candidates.length) throw new HttpError(404, `no place matched "${query}"`);
  // best match by default; `pick` selects another candidate from the same query
  const pick = Math.max(0, Math.min(candidates.length - 1, Number(body.pick ?? 0) || 0));
  const hit = candidates[pick];
  return {
    place: {
      name: (body.name ? String(body.name) : hit.name).toUpperCase(),
      lat: hit.lat,
      lon: hit.lon,
      tz: hit.tz,
    },
    candidates,
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  hooks: ServerHooks,
): Promise<void> {
  const now = Date.now();
  if (now - lastRequestAt < RATE_LIMIT_MS) {
    res.setHeader('Retry-After', '1');
    return send(res, 429, { error: true, message: 'rate limited (1 req/s)' });
  }
  lastRequestAt = now;

  if (!authorized(req)) return send(res, 401, { error: true, message: 'unauthorized' });

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;
  const method = req.method ?? 'GET';

  if (method === 'GET' && pathname === '/healthz') return send(res, 200, { ok: true });

  if (method === 'GET' && pathname === '/stats') {
    return send(res, 200, {
      ...stats(STATS_HISTORY),
      loop: hooks.loopStats?.() ?? null,
    });
  }

  if (pathname === '/message') {
    if (method === 'GET') return send(res, 200, { message: getMessage() ?? null });
    if (method === 'DELETE') {
      clearMessage();
      return send(res, 200, { ok: true, cleared: true });
    }
    if (method === 'POST') {
      const parsed = parseMessage(await readBody(req));
      if (!parsed) return send(res, 400, { error: true, message: 'empty message' });
      const entry = setMessage(parsed.message, parsed.ttlSeconds);
      hooks.onMessage?.(parsed.message);
      return send(res, 201, { ok: true, ...entry });
    }
  }

  if (method === 'GET' && pathname === '/location') {
    return send(res, 200, { locations: PLACES.map((p) => ({ ...p })) });
  }

  const locMatch = pathname.match(/^\/location\/([12])$/);
  if (method === 'POST' && locMatch) {
    const index = Number(locMatch[1]) - 1;
    const raw = await readBody(req);
    const body = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const { place, candidates } = await resolvePlace(body);
    setLocation(index, place);
    hooks.onLocation?.(index);
    return send(res, 200, { ok: true, index: index + 1, place, candidates });
  }

  if (method === 'GET' && pathname === '/geocode') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q) return send(res, 400, { error: true, message: 'missing ?q=' });
    const count = Math.min(20, Math.max(1, Number(url.searchParams.get('count') ?? 5)));
    const results = await searchPlaces(q, count);
    return send(res, 200, { query: q, results });
  }

  return send(res, 404, { error: true, message: 'not found' });
}

/** Start the API server. Returns the http.Server so callers can close it. */
export function startServer(hooks: ServerHooks = {}): Server {
  const server = createServer((req, res) => {
    handle(req, res, hooks).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'internal error';
      if (status >= 500) console.error('api error:', message);
      send(res, status, { error: true, message });
    });
  });
  server.listen(PORT, HOST, () => {
    console.log(
      `api listening on http://${HOST}:${PORT}` + (TOKEN ? ' (token required)' : ''),
    );
  });
  return server;
}
