import fastifyPostgres from "@fastify/postgres";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import {
  registerHealthRoute,
  registerOpenApiRoute,
  registerMeRoutes,
  registerRoleRoutes,
  registerScimRoutes,
  registerOAuthRoute
} from "./features/index.js";
import { loadApiConfig, type ApiConfig } from "./config/index.js";
import { AccessTokenVerifier, AuthorizationStore } from "./auth/index.js";
import { buildAuthPreHandler, buildScimPreHandler } from "./auth/middleware.js";

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
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      try {
        const rawBody = typeof body === "string" ? body : body.toString("utf8");
        done(null, Object.fromEntries(new URLSearchParams(rawBody).entries()));
      } catch (error) {
        done(error as Error);
      }
    }
  );

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

  const tokenVerifier = new AccessTokenVerifier(config);
  const authorizationStore = new AuthorizationStore(
    config,
    config.databaseUrl
      ? {
          query: (text: string, values?: unknown[]) => app.pg.query(text, values)
        }
      : undefined
  );

  const requireMeAuth = buildAuthPreHandler(
    {
      tokenVerifier,
      authorizationStore
    },
    {
      permission: "profile.read",
      delegatedScopes: ["compass.user", "compass.admin"],
      appRoles: ["Compass.Integration.Read", "Compass.Integration.Write", "TimeSync.Admin"],
      allowDelegated: true,
      allowApp: true
    }
  );

  const requireRolesReadAuth = buildAuthPreHandler(
    {
      tokenVerifier,
      authorizationStore
    },
    {
      permission: "roles.read",
      delegatedScopes: ["compass.admin"],
      appRoles: ["Compass.Integration.Read", "Compass.Integration.Write", "TimeSync.Admin"],
      allowDelegated: true,
      allowApp: true,
      tenantParam: "tenantId"
    }
  );

  const requireRolesWriteAuth = buildAuthPreHandler(
    {
      tokenVerifier,
      authorizationStore
    },
    {
      permission: "roles.write",
      delegatedScopes: ["compass.admin"],
      appRoles: ["Compass.Integration.Write", "TimeSync.Admin"],
      allowDelegated: true,
      allowApp: true,
      tenantParam: "tenantId"
    }
  );

  const requireScimAuth = buildScimPreHandler({
    tokenVerifier,
    authorizationStore
  });

  registerHealthRoute(app, now);
  registerOpenApiRoute(app);
  registerOAuthRoute(app, { config, authorizationStore });
  registerMeRoutes(app, { requireMeAuth });
  registerRoleRoutes(app, {
    authorizationStore,
    requireRolesReadAuth,
    requireRolesWriteAuth
  });
  registerScimRoutes(app, {
    authorizationStore,
    requireScimAuth
  });

  return app;
}
