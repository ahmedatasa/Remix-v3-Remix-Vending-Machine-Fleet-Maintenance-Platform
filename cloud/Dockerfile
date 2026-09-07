# ==============================================================================
# Production Dockerfile for KSU Vending Cloud API Service
# Render / Google Cloud Run compatible
# ==============================================================================


# ------------------------------------------------------------------------------
# 1. BUILD STAGE
# ------------------------------------------------------------------------------

FROM node:20-alpine AS builder

# Working directory inside the build container
WORKDIR /app

# Copy dependency manifests first to improve Docker layer caching
COPY package.json package-lock.json ./

# Install all dependencies required for TypeScript/esbuild compilation
RUN npm ci --ignore-scripts

# Copy TypeScript configuration
COPY tsconfig*.json ./

# Copy ONLY the standalone cloud service source
COPY cloud ./cloud

# Build the standalone Cloud API bundle
RUN npx esbuild cloud/src/server.ts \
    --bundle \
    --platform=node \
    --format=cjs \
    --packages=external \
    --sourcemap \
    --outfile=dist/cloud-server.cjs


# ------------------------------------------------------------------------------
# 2. PRODUCTION RUNTIME STAGE
# ------------------------------------------------------------------------------

FROM node:20-alpine AS runner

WORKDIR /app

# Production dependency behavior inside the container.
# Render may override NODE_ENV with its Environment Variable configuration.
ENV NODE_ENV=production

# IMPORTANT:
# Do NOT set ENV PORT here.
# Render / Cloud Run supply process.env.PORT dynamically.


# ------------------------------------------------------------------------------
# 3. INSTALL PRODUCTION DEPENDENCIES
# ------------------------------------------------------------------------------

# Still running as root during IMAGE BUILD.
# This prevents the previous EACCES /app/node_modules error.
COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force


# ------------------------------------------------------------------------------
# 4. COPY BUILT CLOUD APPLICATION
# ------------------------------------------------------------------------------

COPY --from=builder \
    /app/dist/cloud-server.cjs \
    ./dist/cloud-server.cjs

COPY --from=builder \
    /app/dist/cloud-server.cjs.map \
    ./dist/cloud-server.cjs.map


# ------------------------------------------------------------------------------
# 5. COPY DATABASE MIGRATIONS
# ------------------------------------------------------------------------------

COPY cloud/src/db/migrations \
    ./cloud/src/db/migrations


# ------------------------------------------------------------------------------
# 6. NON-ROOT RUNTIME SECURITY
# ------------------------------------------------------------------------------

# Give the runtime user ownership of application files
RUN chown -R node:node /app

# IMPORTANT:
# Switch to the non-root user ONLY AFTER npm ci has completed.
USER node


# ------------------------------------------------------------------------------
# 7. CONTAINER PORT
# ------------------------------------------------------------------------------

# Documentation/default local container port.
# Render/Cloud Run use their supplied PORT at runtime.
EXPOSE 3001


# ------------------------------------------------------------------------------
# 8. HEALTH CHECK
# ------------------------------------------------------------------------------

HEALTHCHECK --interval=30s \
    --timeout=5s \
    --start-period=5s \
    --retries=3 \
    CMD wget -qO- http://localhost:${PORT:-3001}/health || exit 1


# ------------------------------------------------------------------------------
# 9. START CLOUD API
# ------------------------------------------------------------------------------

CMD ["node", "dist/cloud-server.cjs"]
