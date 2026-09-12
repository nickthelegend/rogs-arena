# Arena service image for Railway. Built from the repo root so the workspace
# package @rogs/arena-sdk resolves: RAILWAY_DOCKERFILE_PATH=apps/arena/Dockerfile.
FROM oven/bun:1.3.11

WORKDIR /app
COPY . .
RUN bun install --ignore-scripts

ENV NODE_ENV=production
EXPOSE 8787

# Exec form so SIGTERM reaches the service's graceful shutdown handler.
CMD ["bun", "run", "apps/arena/src/index.ts"]
