# Use a Debian-based Node image that matches common Railway runtimes
FROM node:22-bookworm

# Install build essentials needed to compile native modules like sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install production deps and **force** sqlite3 to be built from source
# against this container's glibc (avoids GLIBC_2.38 mismatch with prebuilts)
RUN npm ci --omit=dev \
 && npm rebuild sqlite3 --build-from-source --verbose

# Copy the rest of the app
COPY . .

# Ensure data directory exists for SQLite
RUN mkdir -p data

# Expose no port needed for Discord bot (dashboard may use internal)

CMD ["node", "src/index.js"]
