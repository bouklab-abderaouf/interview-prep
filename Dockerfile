# syntax=docker/dockerfile:1
#
# Production image: Next's standalone server, no dev dependencies, no secrets.
# docs/DOCKER.md has the commands; `docker compose up --build` does it all.
#
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so
# the build needs them: they come from the `env` build secret (your
# .env.local), filtered to NEXT_PUBLIC_* lines and deleted in the same step,
# so no layer keeps them and no server secret is ever in the build. Server
# secrets (Gemini key, service-role key…) are passed when the container
# starts. Change a NEXT_PUBLIC_* value and you must rebuild.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=env,required=true \
    grep '^NEXT_PUBLIC_' /run/secrets/env | tr -d '\r' > .env.production.local \
 && npm run build \
 && rm .env.production.local

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.js"]
