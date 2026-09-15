import { setupFonts } from './render.js';
import { buildBitFrame } from './card.js';
import { pushCard, requireConfig } from './device.js';

const INTERVAL_S = Math.max(60, Number(process.env.INTERVAL ?? 300));

async function pushOnce(): Promise<void> {
  const { apiKey, deviceId } = requireConfig();
  const now = new Date();
  const img = await buildBitFrame(0, now);
  await pushCard(img, deviceId, apiKey);
}

async function main(): Promise<void> {
  setupFonts();
  const loop = process.argv.includes('--loop');

  if (loop) {
    console.log(`loop: pushing every ${INTERVAL_S}s (Ctrl-C to stop)`);
    const tick = async (): Promise<void> => {
      try {
        await pushOnce();
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
    await pushOnce();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
