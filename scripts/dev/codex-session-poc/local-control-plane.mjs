import http from "node:http";
import process from "node:process";
import { createRequire } from "node:module";

const cacheDir = process.env.CONTROL_PLANE_CACHE_DIR;

if (!cacheDir) {
  throw new Error("CONTROL_PLANE_CACHE_DIR is required");
}

const require = createRequire(import.meta.url);
const { WebSocketServer } = require(`${cacheDir}/node_modules/ws`);

const port = Number(process.env.PORT ?? 8787);

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket, request) => {
  console.log(`ws-open ${request.url ?? "/"}`);

  socket.on("message", (message) => {
    const text = message.toString();
    console.log(`ws-message ${text}`);
    socket.send(`control-ack:${text}`);
  });

  socket.on("close", () => {
    console.log("ws-close");
  });

  socket.on("error", (error) => {
    console.error(`ws-error ${error.message}`);
  });
});

const shutdown = () => {
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, () => {
  console.log(`control-plane listening ${port}`);
});
