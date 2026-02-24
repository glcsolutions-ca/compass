import { SignJWT } from "jose";
import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import {
  OAuthTokenRequestSchema,
  OAuthTokenResponseSchema,
  UnauthorizedErrorSchema
} from "@compass/contracts";
import type { ApiConfig } from "../../config/index.js";
import type { AuthorizationStore } from "../../auth/store.js";

interface RegisterOAuthRouteOptions {
  config: ApiConfig;
  authorizationStore: AuthorizationStore;
}

export function registerOAuthRoute(app: FastifyInstance, options: RegisterOAuthRouteOptions) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const signingSecret = new TextEncoder().encode(options.config.oauthTokenSigningSecret);

  typedApp.post(
    "/v1/oauth/token",
    {
      schema: {
        body: OAuthTokenRequestSchema,
        response: {
          200: OAuthTokenResponseSchema,
          401: UnauthorizedErrorSchema
        }
      }
    },
    async (request, reply) => {
      const body = OAuthTokenRequestSchema.parse(request.body);
      const validated = await options.authorizationStore.validateOAuthClientCredentials(
        body.client_id,
        body.client_secret
      );

      if (!validated) {
        return reply.status(401).send({
          code: "invalid_token",
          message: "Invalid client credentials"
        });
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresIn = options.config.oauthTokenExpiresInSeconds;
      const scope = validated.scopes.join(" ");
      const accessToken = await new SignJWT({
        tid: validated.tenantId,
        azp: validated.clientId,
        appid: validated.clientId,
        idtyp: "app",
        roles: validated.roles
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(options.config.oauthTokenIssuer)
        .setAudience(options.config.oauthTokenAudience)
        .setSubject(validated.clientId)
        .setIssuedAt(now)
        .setExpirationTime(now + expiresIn)
        .sign(signingSecret);

      return {
        access_token: accessToken,
        token_type: "Bearer" as const,
        expires_in: expiresIn,
        scope
      };
    }
  );
}
