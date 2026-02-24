import type { FastifyReply, FastifyRequest } from "fastify";
import {
  assignmentDenied,
  invalidToken,
  permissionDenied,
  tenantDenied,
  type AuthError
} from "./errors.js";
import type { AccessTokenVerifier } from "./token-verifier.js";
import type { AuthorizationStore } from "./store.js";
import type {
  AuthenticatedRequestContext,
  RouteAuthorizationPolicy,
  ScimTokenContext
} from "./types.js";

function hasAny(values: Set<string>, required: readonly string[]) {
  if (required.length === 0) {
    return true;
  }

  return required.some((value) => values.has(value));
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

function replyWithAuthError(reply: FastifyReply, error: AuthError) {
  return reply.status(error.statusCode).send({
    code: error.code,
    message: error.message
  });
}

interface BuildAuthPreHandlerDependencies {
  tokenVerifier: AccessTokenVerifier;
  authorizationStore: AuthorizationStore;
}

export function buildAuthPreHandler(
  deps: BuildAuthPreHandlerDependencies,
  policy: RouteAuthorizationPolicy
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const verified = await deps.tokenVerifier.verifyAuthorizationHeader(
        request.headers.authorization
      );
      const tenantActive = await deps.authorizationStore.isTenantActive(verified.tenantId);
      if (!tenantActive) {
        throw tenantDenied("Tenant is not approved for access");
      }

      if (policy.allowDelegated === false && verified.tokenType === "delegated") {
        throw permissionDenied("Delegated tokens are not allowed for this endpoint");
      }

      if (policy.allowApp === false && verified.tokenType === "app") {
        throw permissionDenied("App-only tokens are not allowed for this endpoint");
      }

      const principal = await deps.authorizationStore.resolvePrincipal(verified);
      if (!principal) {
        throw assignmentDenied("Principal is not provisioned");
      }

      const assigned = await deps.authorizationStore.isPrincipalAssigned(
        verified.tenantId,
        principal.principalId
      );
      if (!assigned) {
        throw assignmentDenied("Principal is not assigned to any role");
      }

      const permissions = await deps.authorizationStore.getEffectivePermissions(
        verified.tenantId,
        principal.principalId
      );
      if (!permissions.has(policy.permission)) {
        throw permissionDenied(`Missing required permission: ${policy.permission}`);
      }

      if (verified.tokenType === "delegated" && !hasAny(verified.scopes, policy.delegatedScopes)) {
        throw permissionDenied("Delegated scope requirement not satisfied");
      }

      if (verified.tokenType === "app" && !hasAny(verified.appRoles, policy.appRoles)) {
        throw permissionDenied("Application role requirement not satisfied");
      }

      if (policy.tenantParam) {
        const params = asRecord(request.params);
        const tenantFromParams = params[policy.tenantParam];
        if (typeof tenantFromParams !== "string" || tenantFromParams !== verified.tenantId) {
          throw tenantDenied("Cross-tenant access is not allowed");
        }
      }

      const context: AuthenticatedRequestContext = {
        ...verified,
        principalId: principal.principalId,
        permissions
      };

      request.auth = context;
    } catch (error) {
      if (error instanceof Error && "statusCode" in error && "code" in error) {
        return replyWithAuthError(reply, error as AuthError);
      }

      request.log.error({ err: error }, "Authentication pre-handler failed");
      return reply.status(401).send({
        code: "invalid_token",
        message: "Authentication failed"
      });
    }
  };
}

export function buildScimPreHandler(deps: BuildAuthPreHandlerDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const scimToken = await deps.tokenVerifier.verifyScimAuthorizationHeader(
        request.headers.authorization
      );
      const tenantActive = await deps.authorizationStore.isTenantActive(scimToken.tenantId);
      if (!tenantActive) {
        throw tenantDenied("Tenant is not approved for provisioning");
      }

      request.scimAuth = scimToken;
    } catch (error) {
      if (error instanceof Error && "statusCode" in error && "code" in error) {
        return replyWithAuthError(reply, error as AuthError);
      }

      request.log.error({ err: error }, "SCIM authentication pre-handler failed");
      return reply.status(401).send({
        code: "invalid_token",
        message: "SCIM authentication failed"
      });
    }
  };
}

export function getRequestAuth(request: FastifyRequest): AuthenticatedRequestContext {
  if (!request.auth) {
    throw invalidToken("Route requires authenticated context");
  }

  return request.auth;
}

export function getScimAuth(request: FastifyRequest): ScimTokenContext {
  if (!request.scimAuth) {
    throw invalidToken("Route requires SCIM authentication");
  }

  return request.scimAuth;
}
