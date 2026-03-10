# syntax=docker/dockerfile:1

# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Install dependencies based on package-lock.json
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN npm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Patch Alpine OS packages to pick up security fixes (e.g. zlib CVE-2026-22184)
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

# Remove npm (and its vulnerable transitive deps like glob, tar) since
# the runner only needs the node binary to execute server.js
RUN npm uninstall -g npm

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Create data directory for runtime config (volume mount point)
# feature-access.json is created on first save from the Setup page;
# loadFeatureAccess() returns safe defaults when the file doesn't exist.
RUN mkdir -p data

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
