import { createApiClient, type ApiClient } from "@compass/sdk";

interface RawClientResult {
  response: Response;
  data?: unknown;
  error?: unknown;
}

export function createCompassClient(request: Request): ApiClient {
  const baseUrl = new URL(request.url).origin;

  return createApiClient({
    baseUrl,
    fetch: globalThis.fetch.bind(globalThis)
  });
}

export function readApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  if ("message" in error && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function normalizeResult(result: RawClientResult): {
  status: number;
  data: unknown;
  error: unknown;
} {
  return {
    status: result.response.status,
    data: result.data ?? null,
    error: result.error ?? null
  };
}

export async function getAuthMe(request: Request) {
  const client = createCompassClient(request);
  const result = await client.GET("/v1/auth/me", {
    credentials: "include"
  });

  return normalizeResult(result as RawClientResult);
}

export async function getWorkspace(request: Request, workspaceSlug: string) {
  const client = createCompassClient(request);
  const result = await client.GET("/v1/workspaces/{workspaceSlug}", {
    params: {
      path: {
        workspaceSlug
      }
    },
    credentials: "include"
  });

  return normalizeResult(result as RawClientResult);
}

export async function createWorkspace(request: Request, payload: { slug: string; name: string }) {
  const client = createCompassClient(request);
  const result = await client.POST("/v1/workspaces", {
    body: payload,
    credentials: "include"
  });

  return normalizeResult(result as RawClientResult);
}

export async function acceptWorkspaceInvite(
  request: Request,
  payload: { workspaceSlug: string; inviteToken: string }
) {
  const client = createCompassClient(request);
  const result = await client.POST("/v1/workspaces/{workspaceSlug}/invites/{token}/accept", {
    params: {
      path: {
        workspaceSlug: payload.workspaceSlug,
        token: payload.inviteToken
      }
    },
    credentials: "include"
  });

  return normalizeResult(result as RawClientResult);
}

export async function logoutSession(request: Request): Promise<number> {
  const client = createCompassClient(request);
  const result = await client.POST("/v1/auth/logout", {
    credentials: "include"
  });

  return (result as RawClientResult).response.status;
}
