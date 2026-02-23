import fastifyPostgres from "@fastify/postgres";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { loadApiConfig, type ApiConfig } from "./config/index.js";
import { registerHealthRoute, registerOpenApiRoute } from "./features/index.js";

export interface BuildApiAppOptions {
  config?: ApiConfig;
  now?: () => Date;
}

export function buildApiApp(options: BuildApiAppOptions = {}) {
  const config = options.config ?? loadApiConfig();
  const now = options.now ?? (() => new Date());

  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(cors, { origin: true });

  if (config.databaseUrl) {
    app.register(fastifyPostgres, {
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      idleTimeoutMillis: config.dbIdleTimeoutMs,
      connectionTimeoutMillis: config.dbConnectionTimeoutMs,
      ssl:
        config.dbSslMode === "require"
          ? { rejectUnauthorized: config.dbSslRejectUnauthorized }
          : undefined
    });

    app.after((error) => {
      if (error) {
        app.log.error(error, "Failed to initialize Postgres plugin");
        return;
      }

      app.pg.pool.on("error", (poolError) => {
        app.log.error({ err: poolError }, "Postgres pool emitted an idle client error");
      });
    });
  }

  registerHealthRoute(app, now);
  registerOpenApiRoute(app);

  return app;
}
