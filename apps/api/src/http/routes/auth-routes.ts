import {
  EntraAdminConsentQuerySchema,
  EntraCallbackQuerySchema,
  EntraDesktopCompleteQuerySchema,
  EntraStartQuerySchema
} from "../../modules/auth/auth-schemas.js";
import { parseAuthError } from "../../modules/auth/auth-service.js";
import type { AuthRoutesContext } from "./route-context.js";

function requireAuthService(input: AuthRoutesContext): input is AuthRoutesContext & {
  authService: NonNullable<AuthRoutesContext["authService"]>;
} {
  return input.authService !== null;
}

export function registerAuthRoutes(input: AuthRoutesContext): void {
  input.app.get("/v1/auth/entra/start", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const query = input.parseOrReply(request.query, EntraStartQuerySchema, response);
    if (!query) {
      return;
    }

    const redirectUri = input.resolveAuthRedirectUri(request);
    if (!redirectUri) {
      response.status(400).json({
        code: "INVALID_REQUEST_HOST",
        message: "Unable to resolve callback host for authentication request"
      });
      return;
    }

    const actor = input.actorContextFromRequest(request);
    const rateResult = input.authRateLimiter.check({
      key: `entra-start:${actor.ip}`,
      now: input.now()
    });
    if (!rateResult.allowed) {
      response.setHeader("retry-after", String(rateResult.retryAfterSeconds));
      response.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many authentication requests"
      });
      return;
    }

    try {
      const result = await input.authService.startEntraLogin({
        returnTo: query.returnTo,
        client: query.client,
        redirectUri,
        userAgent: actor.userAgent,
        ip: actor.ip,
        now: input.now()
      });

      if (result.sessionToken) {
        response.setHeader(
          "set-cookie",
          input.authService.createSessionCookie(result.sessionToken)
        );
      }

      response.redirect(302, result.redirectUrl);
    } catch (error) {
      input.sendAuthError(request, response, error);
    }
  });

  input.app.get("/v1/auth/entra/admin-consent/start", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const query = input.parseOrReply(request.query, EntraAdminConsentQuerySchema, response);
    if (!query) {
      return;
    }

    const redirectUri = input.resolveAuthRedirectUri(request);
    if (!redirectUri) {
      response.status(400).json({
        code: "INVALID_REQUEST_HOST",
        message: "Unable to resolve callback host for authentication request"
      });
      return;
    }

    const actor = input.actorContextFromRequest(request);
    const rateResult = input.authRateLimiter.check({
      key: `entra-admin-consent:${actor.ip}`,
      now: input.now()
    });
    if (!rateResult.allowed) {
      response.setHeader("retry-after", String(rateResult.retryAfterSeconds));
      response.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many authentication requests"
      });
      return;
    }

    try {
      const result = await input.authService.startAdminConsent({
        tenantHint: query.tenantHint,
        returnTo: query.returnTo,
        client: query.client,
        redirectUri,
        now: input.now()
      });
      response.redirect(302, result.redirectUrl);
    } catch (error) {
      input.sendAuthError(request, response, error);
    }
  });

  input.app.get("/v1/auth/entra/callback", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const query = input.parseOrReply(request.query, EntraCallbackQuerySchema, response);
    if (!query) {
      return;
    }

    const redirectUri = input.resolveAuthRedirectUri(request);
    if (!redirectUri) {
      response.status(400).json({
        code: "INVALID_REQUEST_HOST",
        message: "Unable to resolve callback host for authentication request"
      });
      return;
    }

    const actorContext = input.actorContextFromRequest(request);
    const rateResult = input.authRateLimiter.check({
      key: `entra-callback:${actorContext.ip}`,
      now: input.now()
    });
    if (!rateResult.allowed) {
      response.setHeader("retry-after", String(rateResult.retryAfterSeconds));
      response.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many authentication requests"
      });
      return;
    }

    try {
      const result = await input.authService.handleEntraCallback({
        code: query.code,
        state: query.state,
        adminConsent: query.admin_consent,
        tenant: query.tenant,
        scope: query.scope,
        error: query.error,
        errorDescription: query.error_description,
        redirectUri,
        userAgent: actorContext.userAgent,
        ip: actorContext.ip,
        now: input.now()
      });

      if (result.sessionToken) {
        response.setHeader(
          "set-cookie",
          input.authService.createSessionCookie(result.sessionToken)
        );
      }

      response.redirect(302, result.redirectTo);
    } catch (error) {
      input.sendAuthError(request, response, error);
    }
  });

  input.app.get("/v1/auth/desktop/complete", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const query = input.parseOrReply(request.query, EntraDesktopCompleteQuerySchema, response);
    if (!query) {
      return;
    }

    const actorContext = input.actorContextFromRequest(request);
    const rateResult = input.authRateLimiter.check({
      key: `entra-desktop-complete:${actorContext.ip}`,
      now: input.now()
    });
    if (!rateResult.allowed) {
      response.setHeader("retry-after", String(rateResult.retryAfterSeconds));
      response.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many authentication requests"
      });
      return;
    }

    try {
      const result = await input.authService.completeDesktopLogin({
        handoffToken: query.handoff,
        userAgent: actorContext.userAgent,
        ip: actorContext.ip,
        now: input.now()
      });
      response.setHeader("set-cookie", input.authService.createSessionCookie(result.sessionToken));
      response.redirect(302, result.redirectTo);
    } catch (error) {
      const parsed = parseAuthError(error);
      if (parsed.code === "DESKTOP_HANDOFF_INVALID") {
        response.redirect(302, "/login?error=desktop_handoff_invalid");
        return;
      }

      input.sendAuthError(request, response, error);
    }
  });

  input.app.get("/v1/auth/me", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    try {
      const result = await input.authService.readAuthMe({
        sessionToken: input.currentSessionToken(request),
        now: input.now()
      });

      response.status(200).json(result);
    } catch (error) {
      input.sendAuthError(request, response, error);
    }
  });

  input.app.post("/v1/auth/logout", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    try {
      await input.authService.logout({
        sessionToken: input.currentSessionToken(request),
        now: input.now()
      });

      response.setHeader("set-cookie", input.authService.clearSessionCookie());
      response.status(204).send();
    } catch (error) {
      input.sendAuthError(request, response, error);
    }
  });
}
