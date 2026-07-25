FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm install (not ci): lockfile is often generated on Windows and misses
# optional Linux/@emnapi entries that Alpine's npm ci rejects as out of sync.
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
# Placeholders for `next build` only (page-data collection imports db).
# Real secrets must be set on the Dockhost container at runtime.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV JWT_SECRET="build-time-placeholder"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated

EXPOSE 3000
CMD ["npm", "start"]
