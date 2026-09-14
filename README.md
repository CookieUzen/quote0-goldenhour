# Quote/0 golden hour

Renders a 296×152, 1-bit card for the [Quote/0](https://dot.mindreset.tech) e-ink
display showing, side by side, two places (default **Jakarta** and **Hong Kong**):
local time, current temperature, and an **icon for the current sun stage**
(night / twilight / dawn golden hour / morning / noon / afternoon / dusk golden hour).

It renders to PNG locally — no device required yet. Pushing to the Quote/0 image API
comes later.

## Run

```sh
devenv shell
npm run dev              # -> out/card-f0.png
FRAMES=4 npm run dev     # -> out/card-f0..3.png (ray-rotated frames)
```

Fonts are provided by devenv via `CARD_FONT` / `CARD_FONT_BOLD` (DejaVu), so text
renders correctly under NixOS/Skia.

## Layout

```
   JAKARTA           HONG KONG
   14:32               15:32
      (icon)            (icon)
   Afternoon         Golden hour
      31°                27°
             Aug 15, 2026
```

## How the stage is decided

Using [`suncalc`](https://github.com/mourner/suncalc), from the sun's elevation `e`:

| elevation | stage |
|---|---|
| `e < -6°` | night |
| `-6° ≤ e < -4°` | twilight |
| `-4° ≤ e < 6°` | golden hour (dawn before solar noon, dusk after) |
| `e ≥ 6°` | morning / noon / afternoon (noon = solar noon ± 90 min) |

## Files

- `src/locations.ts` — the two cities (only place coordinates live; swap for GPS/Home Assistant later)
- `src/stage.ts` — sun math → stage
- `src/weather.ts` — Open-Meteo current temp (no API key)
- `src/icons.ts` — the stage icons (hand-drawn, frame parameter rotates rays)
- `src/render.ts` — composes the card
- `src/index.ts` — builds frames, thresholds to 1-bit, writes `out/card-fN.png`

## Next

- Push to the device: `POST /api/authV2/open/device/{deviceId}/image` (Bearer API key)
- Feed coordinates from an iOS Shortcut (GPS) or Home Assistant