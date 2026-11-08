# Built by the owner's compose on the NAS (x86_64). No compose file in this repo by design.
FROM node:22-bookworm-slim AS build
# better-sqlite3 may compile its native module during npm ci; build tools stay in this stage only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 MIGRATIONS_DIR=/app/drizzle
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY scripts ./scripts
COPY drizzle ./drizzle
# Files from the Synology share arrive as 700 root (ACL); the app runs as the compose user (1026:100).
# chmod in a RUN step works with any builder (COPY --chmod needs BuildKit).
RUN chmod -R a+rX,go-w /app && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
