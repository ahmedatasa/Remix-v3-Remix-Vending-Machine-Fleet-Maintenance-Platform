# ==============================================================================
# Production Dockerfile for KSU Vending Cloud API Service (Phase 5)
# Deployable to Google Cloud Run / Managed Containers
# ==============================================================================

# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy application source (excluding fleet_data via .dockerignore)
COPY tsconfig*.json ./
COPY cloud ./cloud

# Bundle Cloud Server into a standalone CommonJS bundle
RUN npx esbuild cloud/src/server.ts \
    --bundle \
    --platform=node \
    --format=cjs \
    --packages=external \
    --sourcemap \
    --outfile=dist/cloud-server.cjs

# Production Runtime Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Managed container PORT environment variable (defaults to 3001)
ENV PORT=3001

# Run with non-root user for security
USER node

# Copy package manifests and install only production dependencies
COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled cloud bundle and SQL schema migrations
COPY --chown=node:node --from=builder /app/dist/cloud-server.cjs ./dist/cloud-server.cjs
COPY --chown=node:node --from=builder /app/dist/cloud-server.cjs.map ./dist/cloud-server.cjs.map
COPY --chown=node:node cloud/src/db/migrations ./cloud/src/db/migrations

# Expose container ingress port
EXPOSE 3001

# Health check using the lightweight /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

# Launch the compiled Cloud API server
CMD ["node", "dist/cloud-server.cjs"]
