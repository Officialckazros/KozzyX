# Build native modules (sqlite3) against the exact runtime image so the
# compiled binary matches the runtime glibc. Avoids the prebuilt-binary
# GLIBC mismatch seen on Nixpacks.
FROM node:22-bookworm-slim

WORKDIR /app

# Toolchain needed to compile sqlite3 from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# Force native modules to compile against this image rather than download a
# prebuilt binary built on a different glibc.
RUN npm_config_build_from_source=true npm ci --omit=dev

COPY . .

CMD ["node", "src/index.js"]
