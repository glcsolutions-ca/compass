import fastifyPostgres from "@fastify/postgres";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { loadApiConfig, type ApiConfig } from "./config/index.js";
import {
  InMemoryConsolidatedViewRepository,
  PostgresConsolidatedViewRepository,
  registerConsolidatedViewRoute,
  registerHealthRoute,
  registerOpenApiRoute,
  type ConsolidatedViewRepository
} from "./features/index.js";

export interface BuildApiAppOptions {
  config?: ApiConfig;
  now?: () => Date;
  repository?: ConsolidatedViewRepository;
}

function resolveRepository(
  app: FastifyInstance,
  config: ApiConfig,
  now: () => Date,
  repositoryOverride?: ConsolidatedViewRepository
): ConsolidatedViewRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (config.databaseUrl) {
    return new PostgresConsolidatedViewRepository({
      query: (queryText, values) => app.pg.query(queryText, values)
    });
  }

  return new InMemoryConsolidatedViewRepository(now());
}

export function buildApiApp(options: BuildApiAppOptions = {}) {
  const config = options.config ?? loadApiConfig();
  const now = options.now ?? (() => new Date());

  const app = Fastify({ logger: true });
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

  const repository = resolveRepository(app, config, now, options.repository);

  registerHealthRoute(app, now);
  registerOpenApiRoute(app);
  registerConsolidatedViewRoute(app, {
    config,
    repository,
    now
  });

  return app;
}
