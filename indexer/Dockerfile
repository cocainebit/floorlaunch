# commas indexer: read-only market API + WebSocket feed.
FROM node:22-slim

WORKDIR /app

# Install deps (tsx is a devDependency and is needed to run at start).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV PORT=8787
# Bundled data so no host paths are needed in the container.
ENV IDL_PATH=/app/bundled/floorlaunch.json
ENV CATALOG_PATH=/app/bundled/underlyings.json
ENV LISTINGS_PATH=/app/data/listings.json

# Seed listings metadata from the bundled snapshot.
RUN mkdir -p /app/data && cp /app/bundled/listings.json /app/data/listings.json

EXPOSE 8787
CMD ["npm", "start"]
