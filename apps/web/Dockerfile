FROM node:22-alpine AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /workspace
COPY . .

ARG VITE_API_BASE_URL=http://localhost:3001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @compass/web build
RUN pnpm --filter @compass/web deploy --legacy --prod /opt/app

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /opt/app/ ./

EXPOSE 3000
CMD ["npm", "run", "start"]
