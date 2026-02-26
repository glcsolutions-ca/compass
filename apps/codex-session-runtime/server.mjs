import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "8080", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port number");
}

const bootAt = Date.now();
const bootId = randomUUID();

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    response.end(
      JSON.stringify({
        status: "ok",
        bootId,
        bootAt
      })
    );
    return;
  }

  response.writeHead(404, {
    "content-type": "application/json",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify({ code: "NOT_FOUND", message: "Not Found" }));
});

server.listen(port, host, () => {
  console.info(`codex-session-runtime listening on http://${host}:${port}`);
});
