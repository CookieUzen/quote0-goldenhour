# Quote/0 golden-hour card — loop runner
#
# The card renderer needs DejaVu fonts at explicit paths (Skia has no default
# font lookup in minimal containers) and the prebuilt native binaries of
# sharp / @napi-rs/canvas, which work on the Debian slim base as-is.
FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-dejavu-core \
        fontconfig \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# state directory for the control API (mount a volume here to persist)
RUN mkdir -p /app/state && chown node:node /app/state

ENV NODE_ENV=production \
    CARD_FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
    CARD_FONT_BOLD=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
    OUT_DIR=/tmp/out \
    STATE_FILE=/app/state/message.json

EXPOSE 8787

# secrets (QUOTE0_API_KEY / QUOTE0_DEVICE_ID) come in at runtime via
# compose `env_file: .env` — never baked into the image
USER node

CMD ["npm", "run", "loop"]
