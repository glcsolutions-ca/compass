FROM node:22-alpine

WORKDIR /app

RUN npm install --global @openai/codex@0.106.0

COPY apps/codex-session-runtime/server.mjs ./server.mjs

ENV HOST=0.0.0.0
ENV PORT=8080
ENV SESSION_RUNTIME_ENGINE=codex
ENV CODEX_APP_SERVER_COMMAND=codex
ENV CODEX_APP_SERVER_ARGS=app-server

EXPOSE 8080

CMD ["node", "server.mjs"]
