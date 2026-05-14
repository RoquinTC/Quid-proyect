# Stage 1: Install ALL dependencies (including dev for build)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Provide a dummy NEXTAUTH_SECRET for build time only.
# The real value comes from docker-compose environment at runtime.
ARG NEXTAUTH_SECRET=build-time-dummy-not-used-in-production
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET

# VAPID public key needs to be baked into the client bundle at build time.
# The private key is only used at runtime and comes from docker-compose.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

RUN npx prisma generate
RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Set timezone to Colombia (UTC-5) so new Date() returns Colombia time
ENV TZ=America/Bogota
RUN apk add --no-cache su-exec tzdata

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /data/db && chown nextjs:nodejs /data/db

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Do NOT set USER here — entrypoint must run as root to fix permissions
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENTRYPOINT ["./docker-entrypoint.sh"]