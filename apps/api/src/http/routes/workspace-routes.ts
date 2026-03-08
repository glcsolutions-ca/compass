import {
  InviteTokenParamsSchema,
  WorkspaceCreateRequestSchema,
  WorkspaceSlugParamsSchema,
  WorkspaceInviteCreateRequestSchema,
  type WorkspaceCreateRequest,
  type WorkspaceInviteCreateRequest
} from "../../modules/workspaces/workspaces-schemas.js";
import type { WorkspaceRoutesContext } from "./route-context.js";

function requireAuthService(input: WorkspaceRoutesContext): input is WorkspaceRoutesContext & {
  authService: NonNullable<WorkspaceRoutesContext["authService"]>;
} {
  return input.authService !== null;
}

export function registerWorkspaceRoutes(input: WorkspaceRoutesContext): void {
  input.app.post("/v1/workspaces", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const body = input.parseOrReply<WorkspaceCreateRequest>(
      request.body,
      WorkspaceCreateRequestSchema,
      response
    );
    if (!body) {
      return;
    }

    try {
      const result = await input.authService.createWorkspace({
        sessionToken: input.currentSessionToken(request),
        request: body,
        now: input.now()
      });

      response.status(201).json(result);
    } catch (error) {
      input.sendAuthError(request, response, error);
    }
  });

  input.app.get("/v1/workspaces/:workspaceSlug", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const params = input.parseOrReply(request.params, WorkspaceSlugParamsSchema, response);
    if (!params) {
      return;
    }

    try {
      const result = await input.authService.readWorkspace({
        sessionToken: input.currentSessionToken(request),
        workspaceSlug: params.workspaceSlug,
        now: input.now()
      });
      response.status(200).json(result);
    } catch (error) {
      input.sendAuthError(request, response, error);
    }
  });

  input.app.get("/v1/workspaces/:workspaceSlug/members", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const params = input.parseOrReply(request.params, WorkspaceSlugParamsSchema, response);
    if (!params) {
      return;
    }

    try {
      const result = await input.authService.listWorkspaceMembers({
        sessionToken: input.currentSessionToken(request),
        workspaceSlug: params.workspaceSlug,
        now: input.now()
      });
      response.status(200).json(result);
    } catch (error) {
      input.sendAuthError(request, response, error);
    }
  });

  input.app.post("/v1/workspaces/:workspaceSlug/invites", async (request, response) => {
    if (!requireAuthService(input)) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const params = input.parseOrReply(request.params, WorkspaceSlugParamsSchema, response);
    if (!params) {
      return;
    }

    const body = input.parseOrReply<WorkspaceInviteCreateRequest>(
      request.body,
      WorkspaceInviteCreateRequestSchema,
      response
    );
    if (!body) {
      return;
    }

    try {
      const result = await input.authService.createWorkspaceInvite({
        sessionToken: input.currentSessionToken(request),
        workspaceSlug: params.workspaceSlug,
        request: body,
        now: input.now()
      });
      response.status(201).json(result);
    } catch (error) {
      input.sendAuthError(request, response, error);
    }
  });

  input.app.post(
    "/v1/workspaces/:workspaceSlug/invites/:token/accept",
    async (request, response) => {
      if (!requireAuthService(input)) {
        response
          .status(503)
          .json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
        return;
      }

      const params = input.parseOrReply(request.params, InviteTokenParamsSchema, response);
      if (!params) {
        return;
      }

      try {
        const result = await input.authService.acceptWorkspaceInvite({
          sessionToken: input.currentSessionToken(request),
          workspaceSlug: params.workspaceSlug,
          inviteToken: params.token,
          now: input.now()
        });
        response.status(200).json(result);
      } catch (error) {
        input.sendAuthError(request, response, error);
      }
    }
  );
}
