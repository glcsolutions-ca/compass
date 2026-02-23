FROM node:22-alpine AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /workspace
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @compass/contracts build
RUN pnpm --filter @compass/api build
RUN pnpm --filter @compass/api deploy --legacy --prod /opt/app

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001

COPY --from=build /opt/app/ ./
COPY --from=build /workspace/db/migrations ./db/migrations
COPY --from=build /workspace/db/scripts ./db/scripts

EXPOSE 3001
CMD ["node", "dist/index.js"]
