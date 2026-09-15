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

/** POST a content payload to one of the device's content endpoints. */
async function pushContent(
  path: 'image' | 'text' | 'canvas',
  content: Record<string, unknown>,
  deviceId: string,
  apiKey: string,
  refreshNow: boolean,
): Promise<void> {
  if (process.env.DRY_RUN) {
    console.log(
      `DRY_RUN: would POST ${API_BASE}/api/authV2/open/device/${deviceId}/${path}` +
        ` (refreshNow: ${refreshNow})`,
    );
    return;
  }

  const res = await fetch(`${API_BASE}/api/authV2/open/device/${deviceId}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshNow, ...content }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  console.log(`pushed (${path}): ${json.message ?? 'ok'}`);
}

/** Push the 1-bit PNG (296x152) to the device's image content slot. */
export function pushCard(
  png: Buffer,
  deviceId: string,
  apiKey: string,
  refreshNow = true,
): Promise<void> {
  return pushContent(
    'image',
    {
      // the card is already thresholded to 1-bit — skip device-side dithering
      image: png.toString('base64'),
      border: 0,
      ditherType: 'NONE',
      taskAlias: 'golden-hour card',
    },
    deviceId,
    apiKey,
    refreshNow,
  );
}

/** Push the canvas card (data + windowData) to the device's canvas slot. */
export function pushCanvas(
  payload: {
    data: Record<string, unknown>;
    windowData: unknown;
    layoutFull?: unknown;
    taskAlias: string;
  },
  deviceId: string,
  apiKey: string,
  refreshNow = true,
): Promise<void> {
  return pushContent(
    'canvas',
    {
      data: payload.data,
      windowData: payload.windowData,
      ...(payload.layoutFull ? { layoutFull: payload.layoutFull } : {}),
      taskAlias: payload.taskAlias,
      border: 0,
    },
    deviceId,
    apiKey,
    refreshNow,
  );
}

/** Push the text summary to the device's text content slot. */
export function pushText(
  payload: { title: string; message?: string; signature: string },
  deviceId: string,
  apiKey: string,
  refreshNow = true,
): Promise<void> {
  return pushContent(
    'text',
    { ...payload, taskAlias: 'golden-hour text' },
    deviceId,
    apiKey,
    refreshNow,
  );
}
