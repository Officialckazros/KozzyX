FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev \
 && npm rebuild sqlite3 --build-from-source --verbose

COPY . .

RUN mkdir -p data

CMD ["node", "src/index.js"]
