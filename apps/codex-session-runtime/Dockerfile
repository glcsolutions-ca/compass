FROM node:22-alpine

WORKDIR /app

COPY apps/codex-session-runtime/server.mjs ./server.mjs

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.mjs"]
