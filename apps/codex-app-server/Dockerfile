# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS base
WORKDIR /workspace
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json ./
COPY apps/codex-app-server/package.json apps/codex-app-server/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/testkit/package.json packages/testkit/package.json

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --filter . --filter @compass/contracts... --filter @compass/codex-app-server...

FROM deps AS build
COPY apps/codex-app-server ./apps/codex-app-server
COPY packages/contracts ./packages/contracts
COPY db ./db

RUN pnpm --filter @compass/contracts build \
  && pnpm --filter @compass/codex-app-server build \
  && pnpm --filter @compass/codex-app-server deploy --legacy --prod /opt/app

FROM node:22-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS runtime
WORKDIR /workspace

ARG CODEX_TAG=rust-v0.105.0
ARG CODEX_ASSET=codex-x86_64-unknown-linux-gnu.tar.gz
ARG CODEX_SHA256=30acba08753c2651bf99a7e98a526198f67a995e776bd4915939c8bcb4f6852d

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tar \
  && rm -rf /var/lib/apt/lists/*

RUN CODEX_BIN_NAME="${CODEX_ASSET%.tar.gz}" \
  && curl -fsSL -o /tmp/codex.tgz \
  "https://github.com/openai/codex/releases/download/${CODEX_TAG}/${CODEX_ASSET}" \
  && echo "${CODEX_SHA256}  /tmp/codex.tgz" | sha256sum -c - \
  && tar -xzf /tmp/codex.tgz -C /tmp \
  && test -f "/tmp/${CODEX_BIN_NAME}" \
  && install -m 0755 "/tmp/${CODEX_BIN_NAME}" /usr/local/bin/codex \
  && rm -f /tmp/codex.tgz "/tmp/${CODEX_BIN_NAME}"

COPY --from=build /opt/app/ ./
COPY --from=build /workspace/db/migrations ./db/migrations
COPY --from=build /workspace/db/scripts ./db/scripts

ENV NODE_ENV=production
ENV CODEX_HOST=0.0.0.0
ENV CODEX_PORT=3010

EXPOSE 3010
CMD ["node", "dist/index.js"]
