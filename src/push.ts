import './net.js';
import { setupFonts } from './render.js';
import { buildFrameAndText, to1bit } from './card.js';
import { buildCanvas } from './canvas.js';
import { pushCard, pushCanvas, pushText, requireConfig } from './device.js';
import { startServer } from './server.js';

const INTERVAL_S = Math.max(60, Number(process.env.INTERVAL ?? 300));
/** Pomodoro-ish cycle length for the loop counter (INTERVAL_S * N = full cycle). */
const POMO_TICKS = Math.max(1, Number(process.env.POMO_TICKS ?? 6));

/** Loop channels: rotate through these, force-refreshing each in turn so the
 *  device switches pages (e.g. "sun,msg" = sun chart, then the message page). */
type Channel = 'image' | 'text' | 'sun' | 'msg';
const CHANNELS = (process.env.LOOP_CHANNELS ?? 'sun,msg')
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is Channel => (['image', 'text', 'sun', 'msg'] as const).includes(s as Channel));

// --- loop telemetry, surfaced through the API's GET /stats ------------------
const startedAt = Date.now();
let currentChannel: Channel | null = null;
let currentPomo: string | undefined;
let lastChannel: Channel | null = null;
let lastPushAt: string | null = null;
let lastError: string | null = null;
let nextTickAt = Date.now() + INTERVAL_S * 1000;

async function pushOnce(target: Channel, refreshNow: boolean, pomo?: string): Promise<void> {
  const { apiKey, deviceId } = requireConfig();
  const now = new Date();
  const { png, text } = await buildFrameAndText(0, now);
  // the device gets the hard 1-bit version (ditherType NONE = render as-is)
  const bit = await to1bit(png);

  const [name, job]: [string, Promise<void>] =
    target === 'image'
      ? ['image', pushCard(bit, deviceId, apiKey, refreshNow)]
      : target === 'text'
        ? ['text', pushText(text, deviceId, apiKey, refreshNow)]
        : [
            'canvas',
            pushCanvas(
              await buildCanvas(now, { mode: target, pomo }),
              deviceId,
              apiKey,
              refreshNow,
            ),
          ];
  try {
    await job;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠ ${name} push failed:`, msg);
    throw err;
  }
}

async function main(): Promise<void> {
  setupFonts();
  const loop = process.argv.includes('--loop');

  if (loop) {
    const channels = CHANNELS.length ? CHANNELS : (['sun', 'msg'] as Channel[]);
    let i = 0; // index of the NEXT scheduled tick
    let busy = false;
    const pomoDur = `${Math.round((INTERVAL_S * POMO_TICKS) / 60)}m`;

    console.log(
      `loop: rotating [${channels.join(', ')}] every ${INTERVAL_S}s, force-refreshing ` +
        `the active page; pomo cycle ${(INTERVAL_S / 60).toFixed(0)}m x ${POMO_TICKS} ` +
        `= ${(INTERVAL_S * POMO_TICKS) / 60}m (Ctrl-C to stop)`,
    );

    /** Push one page; returns whether it succeeded. Serialised by `busy`. */
    const run = async (ch: Channel, pomo: string | undefined, reason: string): Promise<boolean> => {
      if (busy) {
        console.log('skip push (previous still running):', reason || ch);
        return false;
      }
      busy = true;
      try {
        await pushOnce(ch, true, pomo);
        currentChannel = ch;
        currentPomo = pomo;
        lastChannel = ch;
        lastPushAt = new Date().toISOString();
        lastError = null;
        console.log(
          new Date().toISOString(),
          `→ ${ch}${pomo ? ` (${pomo})` : ''}${reason ? ` [${reason}]` : ''}`,
        );
        return true;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(new Date().toISOString(), 'push failed:', lastError);
        return false;
      } finally {
        busy = false;
      }
    };

    /** Scheduled rotation: advance to the next page, bumping the pomo counter. */
    const scheduledTick = async (): Promise<void> => {
      try {
        if (busy) {
          console.log('skip scheduled tick (previous still running)');
          return;
        }
        const ch = channels[i % channels.length];
        // e.g. "1/6 (30m)" — the span makes the counter self-explanatory
        const pomo = `${(i % POMO_TICKS) + 1}/${POMO_TICKS} (${pomoDur})`;
        i++;
        await run(ch, pomo, '');
      } finally {
        nextTickAt = Date.now() + INTERVAL_S * 1000;
      }
    };

    /**
     * Triggered update (message / location): re-render and re-upload the page
     * currently on screen, WITHOUT advancing the rotation or pomo counter — so
     * the scheduled ticks stay aligned and resume on their own.
     */
    const refreshCurrent = (reason: string): void => {
      const ch = currentChannel ?? channels[0];
      void run(ch, currentPomo, reason);
    };

    await scheduledTick();
    const timer = setInterval(() => void scheduledTick(), INTERVAL_S * 1000);

    const server = startServer({
      onMessage: (msg) => {
        console.log(`message set: ${JSON.stringify(msg.slice(0, 60))}`);
        refreshCurrent('message');
      },
      onLocation: (index) => {
        console.log(`location ${index + 1} updated`);
        refreshCurrent(`location/${index + 1}`);
      },
      loopStats: () => ({
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        intervalSec: INTERVAL_S,
        pomoTicks: POMO_TICKS,
        channels,
        currentChannel,
        currentPomo: currentPomo ?? null,
        nextChannel: channels[i % channels.length],
        lastChannel,
        lastPushAt,
        lastError,
        nextTickInSec: Math.max(0, Math.round((nextTickAt - Date.now()) / 1000)),
      }),
    });

    const stop = (): void => {
      clearInterval(timer);
      server.close();
      console.log('\nloop stopped');
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } else {
    // one-shot: the image card is the main display; the sun canvas updates silently
    await pushOnce('image', true);
    await pushOnce('sun', false);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
