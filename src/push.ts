import { setupFonts } from './render.js';
import { buildFrameAndText, to1bit } from './card.js';
import { buildCanvas } from './canvas.js';
import { pushCard, pushCanvas, pushText, requireConfig } from './device.js';

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

async function pushOnce(
  target: Channel,
  refreshNow: boolean,
  pomo?: string,
): Promise<void> {
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
    console.warn(`⚠ ${name} push failed (continuing):`, err instanceof Error ? err.message : err);
  }
}

async function main(): Promise<void> {
  setupFonts();
  const loop = process.argv.includes('--loop');

  if (loop) {
    const channels = CHANNELS.length ? CHANNELS : (['sun', 'msg'] as Channel[]);
    console.log(
      `loop: rotating [${channels.join(', ')}] every ${INTERVAL_S}s, force-refreshing ` +
        `the active page; pomo cycle ${(INTERVAL_S / 60).toFixed(0)}m x ${POMO_TICKS} ` +
        `= ${(INTERVAL_S * POMO_TICKS) / 60}m (Ctrl-C to stop)`,
    );
    let i = 0;
    const tick = async (): Promise<void> => {
      const ch = channels[i % channels.length];
      const pomo = `${(i % POMO_TICKS) + 1}/${POMO_TICKS}`;
      try {
        await pushOnce(ch, true, pomo);
        console.log(new Date().toISOString(), `→ ${ch} (${pomo})`);
      } catch (err) {
        console.error(new Date().toISOString(), 'push failed:', err);
      }
      i++;
    };
    await tick();
    const timer = setInterval(tick, INTERVAL_S * 1000);
    const stop = (): void => {
      clearInterval(timer);
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
