import { setupFonts } from './render.js';
import { buildFrameAndText } from './card.js';
import { pushCard, pushText, requireConfig } from './device.js';

const INTERVAL_S = Math.max(60, Number(process.env.INTERVAL ?? 300));

async function pushOnce(refreshNow: boolean): Promise<void> {
  const { apiKey, deviceId } = requireConfig();
  const { png, text } = await buildFrameAndText(0, new Date());

  // Push to both content slots: whichever card type the device's loop is
  // configured with gets fresh content. A failure on one channel (e.g. the
  // slot isn't configured on the device) is a warning, not fatal.
  const channels: Array<[string, Promise<void>]> = [
    ['image', pushCard(png, deviceId, apiKey, refreshNow)],
    ['text', pushText(text, deviceId, apiKey, refreshNow)],
  ];
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
