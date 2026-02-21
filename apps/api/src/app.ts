import cors from "@fastify/cors";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { loadApiConfig, type ApiConfig } from "./config/index.js";
import {
  InMemoryConsolidatedViewRepository,
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

export function buildApiApp(options: BuildApiAppOptions = {}) {
  const config = options.config ?? loadApiConfig();
  const now = options.now ?? (() => new Date());
  const repository = options.repository ?? new InMemoryConsolidatedViewRepository(now());

  const app = Fastify({ logger: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(cors, { origin: true });

  registerHealthRoute(app, now);
  registerOpenApiRoute(app);
  registerConsolidatedViewRoute(app, {
    config,
    repository,
    now
  });

  return app;
}
