FROM node:20-alpine AS deps
WORKDIR /app
# better-sqlite3 requires Python and build tools for native compilation
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /tmp/aura && chmod 777 /tmp/aura
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD ps aux | grep -v grep | grep "tsx" || exit 1
CMD ["npx", "tsx", "src/index.ts"]