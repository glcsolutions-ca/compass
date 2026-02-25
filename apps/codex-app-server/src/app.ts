import { createServer, type Server } from "node:http";
import cors from "cors";
import express, { type Express } from "express";
import { WebSocketServer } from "ws";
import { loadCodexAppConfig, type CodexAppConfig } from "./config/index.js";
import { CodexGateway } from "./codex/gateway.js";
import { registerGatewayRoutes } from "./features/routes.js";
import { WebSocketHub } from "./realtime/ws-hub.js";
import { InMemoryRepository, type PersistenceRepository } from "./storage/repository.js";

interface LoggerLike {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export interface BuildCodexGatewayAppOptions {
  config?: CodexAppConfig;
  repository?: PersistenceRepository;
  gateway?: CodexGateway;
  wsHub?: WebSocketHub;
}

export interface CodexGatewayApp {
  readonly app: Express;
  readonly server: Server;
  readonly log: LoggerLike;
  listen(options: { host: string; port: number }): Promise<void>;
  close(): Promise<void>;
}

export function buildCodexGatewayApp(options: BuildCodexGatewayAppOptions = {}): CodexGatewayApp {
  const config = options.config ?? loadCodexAppConfig();
  const log = createLogger(config.logLevel);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  const repository = options.repository ?? new InMemoryRepository();
  const hub = options.wsHub ?? new WebSocketHub();
  const gateway =
    options.gateway ??
    new CodexGateway({
      config,
      repository,
      hub,
      logger: log
    });

  registerGatewayRoutes(app, {
    gateway,
    repository
  });

  const wsServer = new WebSocketServer({ noServer: true });
  const server = createServer(app);

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname !== "/v1/stream") {
      socket.destroy();
      return;
    }

    const threadId = url.searchParams.get("threadId");
    wsServer.handleUpgrade(request, socket, head, (webSocket) => {
      hub.subscribe(webSocket, threadId);
    });
  });

  let isListening = false;

  return {
    app,
    server,
    log,
    async listen({ host, port }): Promise<void> {
      if (isListening) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("error", onError);
          reject(error);
        };

        server.on("error", onError);
        server.listen(port, host, () => {
          server.off("error", onError);
          resolve();
        });
      });

      isListening = true;

      if (!config.startOnBoot) {
        log.info("CODEX_START_ON_BOOT=false; codex process will start on first request");
        return;
      }

      try {
        await gateway.start();
      } catch (error) {
        log.error(
          { err: error },
          "Failed to start codex process on boot. Service remains available for retry."
        );
      }
    },
    async close(): Promise<void> {
      hub.closeAll();
      wsServer.close();

      if (isListening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
        isListening = false;
      }

      await gateway.stop();
      await repository.close();
    }
  };
}

function createLogger(level: CodexAppConfig["logLevel"]): LoggerLike {
  if (level === "silent") {
    return {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    };
  }

  return {
    error: (...args: unknown[]) => {
      console.error(...args);
    },
    warn: (...args: unknown[]) => {
      console.warn(...args);
    },
    info: (...args: unknown[]) => {
      console.info(...args);
    },
    debug: (...args: unknown[]) => {
      if (level === "debug" || level === "trace") {
        console.debug(...args);
      }
    }
  };
}
