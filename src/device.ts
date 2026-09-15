/**
 * Quote/0 device push client.
 *
 * Secrets (QUOTE0_API_KEY, QUOTE0_DEVICE_ID) are declared in secretspec.toml
 * and stored via the dotenv provider; run the app through secretspec so they
 * land in the process environment:
 *
 *   secretspec run --provider dotenv -- npm run loop
 *
 * The device must have an "Open API" content card in its loop task in the Dot.
 * app, otherwise pushed content has nowhere to show.
 */

const API_BASE = process.env.QUOTE0_API_BASE ?? 'https://dot.mindreset.tech';

export function requireConfig(): { apiKey: string; deviceId: string } {
  const apiKey = process.env.QUOTE0_API_KEY;
  const deviceId = process.env.QUOTE0_DEVICE_ID;
  if (!apiKey || !deviceId) {
    console.error(
      'Missing QUOTE0_API_KEY / QUOTE0_DEVICE_ID.\n' +
        'Store them with secretspec, then run through it:\n' +
        '  secretspec set QUOTE0_API_KEY --provider dotenv\n' +
        '  secretspec set QUOTE0_DEVICE_ID --provider dotenv\n' +
        '  secretspec run --provider dotenv -- npm run loop',
    );
    process.exit(1);
  }
  return { apiKey, deviceId };
}

/** Push a PNG (already 1-bit, 296x152) to the device. */
export async function pushCard(
  png: Buffer,
  deviceId: string,
  apiKey: string,
): Promise<void> {
  const body = {
    refreshNow: true,
    // the card is already thresholded to 1-bit — skip device-side dithering
    image: png.toString('base64'),
    border: 0,
    ditherType: 'NONE',
    taskAlias: 'golden-hour card',
  };

  if (process.env.DRY_RUN) {
    console.log(`DRY_RUN: would POST ${API_BASE}/api/authV2/open/device/${deviceId}/image`);
    return;
  }

  const res = await fetch(`${API_BASE}/api/authV2/open/device/${deviceId}/image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  console.log(`pushed: ${json.message ?? 'ok'}`);
}
