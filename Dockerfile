# Stage 1: build
FROM node:18.20-slim AS builder

# 1. Set a non-root user early for npm install 
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

# 2. Copy only what’s needed and install deps
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# 3. Copy app code + static assets
COPY src/ ./src
COPY data.csv ./data.csv

# 4. Fix permissions
RUN chown -R app:app /app

# Stage 2: final runtime image
FROM node:18.20-slim

# 5. Create the same non-root user/group
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

# 6. Copy from builder
COPY --from=builder --chown=app:app /app ./

# 7. Drop Linux capabilities (optional, requires Docker run flags)
#    e.g. docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE ...

# 8. Set environment
ENV NODE_ENV=production

# 9. Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

# 10. Switch to non-root user
USER app

# 11. Start the service
CMD ["node", "src/index.js"]
