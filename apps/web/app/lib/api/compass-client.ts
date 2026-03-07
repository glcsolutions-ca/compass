import { createApiClient, type ApiClient } from "@compass/sdk";

interface RawClientResult {
  response: Response;
  data?: unknown;
  error?: unknown;
}

function resolveCompassBaseUrl(request: Request): string {
  const configuredBaseUrl =
    typeof process !== "undefined" && process.env
      ? process.env.VITE_API_BASE_URL?.trim() || process.env.API_BASE_URL?.trim() || ""
      : "";

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return new URL(request.url).origin;
}

function createForwardingFetch(request: Request): typeof fetch {
  return async (input, init) => {
    const existingHeaders =
      input instanceof Request ? new Headers(input.headers) : new Headers(init?.headers);
    const headers = new Headers(existingHeaders);
    const cookieHeader = request.headers.get("cookie");
    const originHeader = request.headers.get("origin") ?? new URL(request.url).origin;
    const refererHeader = request.headers.get("referer") ?? request.url;

    if (cookieHeader && !headers.has("cookie")) {
      headers.set("cookie", cookieHeader);
    }

    if (originHeader && !headers.has("origin")) {
      headers.set("origin", originHeader);
    }

    if (refererHeader && !headers.has("referer")) {
      headers.set("referer", refererHeader);
    }

    if (input instanceof Request) {
      return globalThis.fetch(
        new Request(input, {
          ...init,
          headers
        })
      );
    }

    return globalThis.fetch(input, {
      ...init,
      headers
    });
  };
}

export function createCompassClient(request: Request): ApiClient {
  return createApiClient({
    baseUrl: resolveCompassBaseUrl(request),
    fetch: createForwardingFetch(request)
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

export const __private__ = {
  createForwardingFetch,
  resolveCompassBaseUrl
};
