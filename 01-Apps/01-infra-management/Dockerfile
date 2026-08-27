FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN if [ ! -f .infra-management-seed.sqlite ]; then touch .infra-management-seed.sqlite; fi
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000 \
  DOCKER_CONFIG=/app/data/docker-config
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates docker.io git gosu \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/data \
  && chown nextjs:nodejs /app/data
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.infra-management-seed.sqlite /app/seed/infra-management.sqlite
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["sh", "./docker-entrypoint.sh"]
