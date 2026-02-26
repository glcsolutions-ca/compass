# syntax=docker/dockerfile:1.7

FROM node:22-alpine@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/testkit/package.json packages/testkit/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter . --filter @compass/contracts... --filter @compass/worker...

FROM deps AS build
COPY apps/worker ./apps/worker
COPY packages/contracts ./packages/contracts

RUN pnpm --filter @compass/contracts build
RUN pnpm --filter @compass/worker build
RUN pnpm --filter @compass/worker deploy --legacy --prod /opt/app

FROM node:22-alpine@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV WORKER_RUN_MODE=loop
ENV WORKER_MAX_MESSAGES=10
ENV WORKER_MAX_WAIT_SECONDS=15

COPY --from=build /opt/app/ ./

CMD ["node", "dist/index.js"]
