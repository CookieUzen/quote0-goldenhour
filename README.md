# ☀️ Quote/0 Golden Hour

> [!WARNING]
> **⚠️ 100% VIBECODED ⚠️** This entire project — design, architecture, code,
> commit messages, and this warning — was produced through pure vibe-coding
> with an AI pair programmer. A human pointed at things and said "make it
> prettier" and "now push it to a device." Proceed with appropriate levels of
> trust, skepticism, and awe.

A shared, minimal information companion for two distant places. This project renders a 296×152, 1-bit card for the [Quote/0](https://dot.mindreset.tech) e-ink display, creating a quiet connection between two people by visualizing their shared relationship with the sun.

## 🌟 The Concept

Instead of a cluttered dashboard, this project focuses on the **stage of the day**. It calculates the sun's position for two different cities and renders a minimalist visual representation: are you both in the same light? Is one in the golden hour while the other is in deep night?

By mapping current sun elevation to a set of "stages," it transforms raw data (latitude, longitude, time) into a visual mood.

## 🛠 Technical Stack

- **Language**: TypeScript (ESM)
- **Environment**: [devenv.sh](https://devenv.sh) (Nix-based reproducible dev shells)
- **Sun Math**: [`suncalc`](https://github.com/mourner/suncalc) for precise solar elevation and timing.
- **Weather**: [Open-Meteo API](https://open-meteo.com/) for current temperatures (no API key required).
- **Rendering**: [`@napi-rs/canvas`](https://github.com/napi-rs/canvas) for high-performance rendering on NixOS.
- **Processing**: [`sharp`](https://sharp.pixelplumbing.com/) for grayscale conversion and 1-bit thresholding to ensure crispness on e-ink.

## 🌅 The "Sun Stage" Logic

The card determines the current stage based on the sun's elevation `e` (degrees) and proximity to solar noon:

| Elevation (`e`) | Stage | Description |
| :--- | :--- | :--- |
| `e < -6°` | **Night** | Astronomical/Nautical night. |
| `-6° ≤ e < -4°` | **Twilight** | Civil twilight (pre-sunrise / post-sunset). |
| `-4° ≤ e < 6°` | **Golden Hour** | Warm light. **Dawn** (before solar noon) or **Dusk** (after). |
| `e ≥ 6°` | **Daylight** | **Morning** $\rightarrow$ **Noon** ($\pm 90$ min of solar noon) $\rightarrow$ **Afternoon**. |

## 🚀 Getting Started

### Prerequisites
You need [devenv](https://devenv.sh/) installed on your system.

### Installation & Run
```sh
cd ~/git/quote0-goldenhour
devenv shell
npm run dev
```
This generates a PNG in `out/card-f0.png`.

### Advanced Usage
- **Preview a specific moment**: Use the `NOW` env var (ISO 8601).
  ```sh
  NOW=2026-09-15T23:00:00Z npm run dev
  ```
- **Create a frame sequence**: Use `FRAMES` to rotate the sun's rays (for e-ink animation).
  ```sh
  FRAMES=4 npm run dev
  ```
- **Custom title-bar message**: right side of the bar, auto-shrinks / wraps / ellipsizes.
  ```sh
  CARD_MSG="good morning :)" npm run dev
  ```
- **Old two-column layout**: `CARD_STYLE=columns npm run dev`.

## 📡 Pushing to the device

Secrets are declared in `secretspec.toml` and stored with the dotenv provider
(`.env`, git-ignored). Set them once:

```sh
secretspec set QUOTE0_API_KEY --provider dotenv    # Dot. app key (dot_app_...)
secretspec set QUOTE0_DEVICE_ID --provider dotenv  # device ID from the Dot. app
```

Then run through secretspec so the values land in the environment:

```sh
secretspec run --provider dotenv -- npm run push            # image + canvas (default)
secretspec run --provider dotenv -- npm run loop
PUSH_MODE=text secretspec run --provider dotenv -- npm run loop:text   # legacy text card
CANVAS_LAYOUT=chart secretspec run --provider dotenv -- npm run loop
```

`npm run push` forces an immediate device refresh (`refreshNow: true`); in
`loop` mode pushes are **not** forced — new content is uploaded and the device
picks it up on its own auto-refresh cycle.

Both slots are updated on every push, but only the **primary** one ever forces
a refresh / gets displayed — the other updates silently (and is pushed first),
so the device never flip-flops between pages. Default primary is the image
card; switch with `PUSH_PRIMARY=text`.```

The card is rendered, thresholded to 1-bit, and pushed to
`POST /api/authV2/open/device/{deviceId}/image` (`ditherType: NONE`, since the
image is already 1-bit). **The device needs matching content cards in its loop
task in the Dot. app** — an "Open API" image card *and* optionally a text card,
since each push also updates the text content slot (`title` = temps + stages,
`message` = cities + local times, `signature` = date). A failure on one channel
(e.g. the slot isn't configured on the device) is logged as a warning; the loop
keeps running. `DRY_RUN=1` runs the whole pipeline without POSTing.

## 🐳 Docker (server deployment)

The included `Dockerfile` + `compose.yaml` run the push loop on any server.
Secrets are **never baked into the image** — they are injected at runtime from
the same `.env` that secretspec writes:

```sh
# on the server
git clone https://github.com/CookieUzen/quote0-goldenhour && cd quote0-goldenhour
printf 'QUOTE0_API_KEY=dot_app_...\nQUOTE0_DEVICE_ID=...\n' > .env
docker compose up -d

# optional overrides (compose reads .env for these too)
echo 'INTERVAL=900' >> .env
```

Logs: `docker compose logs -f`. Stop: `docker compose down`. The container
runs as a non-root user and restarts automatically unless stopped.

## ⚙️ Configuration

Coordinates and timezones are stored in `src/locations.ts`. You can easily swap these for your own cities:

```ts
export const PLACES: Place[] = [
  { name: 'YOUR CITY', lat: 0.0, lon: 0.0, tz: 'Asia/Tokyo' },
  { name: 'FRIEND CITY', lat: 0.0, lon: 0.0, tz: 'America/New_York' },
];
```

## 🗺 Project Architecture

- `locations.ts`: Source of truth for coordinates and timezones.
- `stage.ts`: Calculates solar elevation and maps it to one of the 7 stages.
- `weather.ts`: Fetches current temp from Open-Meteo.
- `icons.ts`: Hand-drawn canvas functions for each stage icon.
- `render.ts`: Composes the 296×152 layout, handles fonts and layout.
- `index.ts`: Orchestrates the pipeline: Data $\rightarrow$ Image $\rightarrow$ 1-bit Threshold $\rightarrow$ File.

## 🛤 Roadmap

- [x] **Device Integration**: `src/device.ts` + `src/push.ts` push rendered images to the Quote/0 REST API (`npm run push` / `npm run loop`).
- [ ] **Dynamic Locations**: Feed coordinates via iOS Shortcuts (GPS) or Home Assistant.
- [ ] **Pixel Fonts**: Replace DejaVu with an embedded bitmap pixel font for ultra-crisp 1-bit text.
- [ ] **shared-state**: Integration with a backend to allow real-time "thinking of you" nudges.
