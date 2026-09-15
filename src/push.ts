import { setupFonts } from './render.js';
import { buildFrameAndText } from './card.js';
import { buildCanvas } from './canvas.js';
import { pushCard, pushCanvas, pushText, requireConfig } from './device.js';

const INTERVAL_S = Math.max(60, Number(process.env.INTERVAL ?? 300));
/** Which content slot gets the forced refresh / ends up displayed. */
const PRIMARY: 'image' | 'text' | 'canvas' =
  process.env.PUSH_PRIMARY === 'text' || process.env.PUSH_PRIMARY === 'canvas'
    ? process.env.PUSH_PRIMARY
    : 'image';
/** Canvas mode is the default; the text card is the legacy fallback. */
const CANVAS_MODE = !(
  process.argv.includes('--text') || process.env.PUSH_MODE === 'text'
);

async function pushOnce(refreshNow: boolean): Promise<void> {
  const { apiKey, deviceId } = requireConfig();
  const now = new Date();
  const { png, text } = await buildFrameAndText(0, now);

  // Push BOTH content slots, but only ever force-refresh the primary one —
  // otherwise the device jumps to the image page, then the text page, and
  // back, every single update. The secondary slot updates silently, and is
  // pushed FIRST so the device settles on the primary page.
  const imagePush: [string, Promise<void>] = [
    'image',
    pushCard(png, deviceId, apiKey, refreshNow && PRIMARY === 'image'),
  ];
  const secondPush: [string, Promise<void>] = CANVAS_MODE
    ? [
        'canvas',
        pushCanvas(
          await buildCanvas(now),
          deviceId,
          apiKey,
          refreshNow && PRIMARY === 'canvas',
        ),
      ]
    : [
        'text',
        pushText(text, deviceId, apiKey, refreshNow && PRIMARY === 'text'),
      ];
  const channels =
    PRIMARY === 'image' ? [secondPush, imagePush] : [imagePush, secondPush];
  const results = await Promise.allSettled(channels.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`⚠ ${channels[i][0]} push failed (continuing):`, r.reason?.message ?? r.reason);
    }
  });
}

async function main(): Promise<void> {
  setupFonts();
  const loop = process.argv.includes('--loop');

  if (loop) {
    console.log(
      `loop: pushing every ${INTERVAL_S}s without forcing refresh ` +
        '(device updates on its own cycle; Ctrl-C to stop)',
    );
    const tick = async (): Promise<void> => {
      try {
        await pushOnce(false);
      } catch (err) {
        console.error(new Date().toISOString(), 'push failed:', err);
      }
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
    await pushOnce(true);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
