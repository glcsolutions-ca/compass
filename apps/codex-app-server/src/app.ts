import cors from "@fastify/cors";
import fastifyPostgres from "@fastify/postgres";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { loadCodexAppConfig, type CodexAppConfig } from "./config/index.js";
import { CodexGateway } from "./codex/gateway.js";
import { registerGatewayRoutes } from "./features/routes.js";
import { WebSocketHub } from "./realtime/ws-hub.js";
import {
  InMemoryRepository,
  PostgresRepository,
  type PersistenceRepository
} from "./storage/repository.js";

export interface BuildCodexGatewayAppOptions {
  config?: CodexAppConfig;
  repository?: PersistenceRepository;
  gateway?: CodexGateway;
  wsHub?: WebSocketHub;
}

export function buildCodexGatewayApp(options: BuildCodexGatewayAppOptions = {}) {
  const config = options.config ?? loadCodexAppConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(cors, { origin: true });
  app.register(websocket);

  if (config.databaseUrl) {
    app.register(fastifyPostgres, {
      connectionString: config.databaseUrl
    });
  }

  const repository = options.repository ?? createRepository(config);
  const hub = options.wsHub ?? new WebSocketHub();
  const gateway =
    options.gateway ??
    new CodexGateway({
      config,
      repository,
      hub,
      logger: app.log
    });

  app.register(async (instance) => {
    registerGatewayRoutes(instance, {
      gateway,
      repository,
      hub
    });
  });

  app.addHook("onReady", async () => {
    if (!config.startOnBoot) {
      app.log.info("CODEX_START_ON_BOOT=false; codex process will start on first request");
      return;
    }

    try {
      await gateway.start();
    } catch (error) {
      app.log.error(
        { err: error },
        "Failed to start codex process on boot. Service remains available for retry."
      );
    }
  });

  app.addHook("onClose", async () => {
    await gateway.stop();
    hub.closeAll();
    await repository.close();
  });

  return app;
}

function createRepository(config: CodexAppConfig): PersistenceRepository {
  if (!config.databaseUrl) {
    return new InMemoryRepository();
  }

  return new PostgresRepository(config.databaseUrl);
}
