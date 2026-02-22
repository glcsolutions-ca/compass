FROM node:24-alpine AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /workspace
COPY . .

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ARG NEXT_PUBLIC_BEARER_TOKEN=
ARG NEXT_PUBLIC_DEV_BEARER_TOKEN=

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_BEARER_TOKEN=${NEXT_PUBLIC_BEARER_TOKEN}
ENV NEXT_PUBLIC_DEV_BEARER_TOKEN=${NEXT_PUBLIC_DEV_BEARER_TOKEN}

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @compass/sdk build
RUN pnpm --filter @compass/web build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /workspace/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
