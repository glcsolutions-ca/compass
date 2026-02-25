FROM node:22-alpine AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /workspace
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @compass/contracts build
RUN pnpm --filter @compass/worker build
RUN pnpm --filter @compass/worker deploy --legacy --prod /opt/app

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV WORKER_RUN_MODE=loop
ENV WORKER_MAX_MESSAGES=10
ENV WORKER_MAX_WAIT_SECONDS=15

COPY --from=build /opt/app/ ./

CMD ["node", "dist/index.js"]
