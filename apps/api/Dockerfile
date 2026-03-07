# syntax=docker/dockerfile:1.7

FROM node:22-alpine@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/session-agent/package.json packages/session-agent/package.json
COPY packages/session-agent-protocol/package.json packages/session-agent-protocol/package.json
COPY packages/testkit/package.json packages/testkit/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter . --filter @compass/contracts... --filter @compass/api...

FROM deps AS build
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
COPY packages/session-agent ./packages/session-agent
COPY packages/session-agent-protocol ./packages/session-agent-protocol
COPY db ./db

RUN pnpm --filter @compass/contracts build
RUN pnpm --filter @compass/session-agent-protocol build
RUN pnpm --filter @compass/session-agent build
RUN pnpm --filter @compass/api build
RUN pnpm --filter @compass/api deploy --legacy --prod /opt/app

FROM node:22-alpine@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001

COPY --from=build /opt/app/ ./
COPY --from=build /workspace/db/migrations ./db/migrations
COPY --from=build /workspace/db/scripts ./db/scripts
COPY --from=build /workspace/db/seeds ./db/seeds

EXPOSE 3001
CMD ["node", "dist/index.js"]
