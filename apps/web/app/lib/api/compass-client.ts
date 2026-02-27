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

export async function getTenant(request: Request, tenantSlug: string) {
  const client = createCompassClient(request);
  const result = await client.GET("/v1/tenants/{tenantSlug}", {
    params: {
      path: {
        tenantSlug
      }
    },
    credentials: "include"
  });

  return normalizeResult(result as RawClientResult);
}

export async function createTenant(request: Request, payload: { slug: string; name: string }) {
  const client = createCompassClient(request);
  const result = await client.POST("/v1/tenants", {
    body: payload,
    credentials: "include"
  });

  return normalizeResult(result as RawClientResult);
}

export async function acceptTenantInvite(
  request: Request,
  payload: { tenantSlug: string; inviteToken: string }
) {
  const client = createCompassClient(request);
  const result = await client.POST("/v1/tenants/{tenantSlug}/invites/{token}/accept", {
    params: {
      path: {
        tenantSlug: payload.tenantSlug,
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

function readStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readAgentThread(data: unknown): {
  threadId: string;
  executionMode: "cloud" | "local";
} | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const thread = (data as { thread?: unknown }).thread;
  if (!thread || typeof thread !== "object") {
    return null;
  }

  const threadId = readStringField((thread as { threadId?: unknown }).threadId);
  const executionMode = (thread as { executionMode?: unknown }).executionMode;
  if (!threadId || (executionMode !== "cloud" && executionMode !== "local")) {
    return null;
  }

  return {
    threadId,
    executionMode
  };
}

function readTurnResult(data: unknown): { turnId: string; outputText: string | null } | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const turn = (data as { turn?: unknown }).turn;
  if (!turn || typeof turn !== "object") {
    return null;
  }

  const turnId = readStringField((turn as { turnId?: unknown }).turnId);
  if (!turnId) {
    return null;
  }

  const outputText = (data as { outputText?: unknown }).outputText;

  return {
    turnId,
    outputText: typeof outputText === "string" ? outputText : null
  };
}

export async function createAgentThread(
  request: Request,
  payload: {
    tenantSlug: string;
    executionMode: "cloud" | "local";
  }
) {
  const client = createCompassClient(request);
  const result = await client.POST("/v1/agent/threads", {
    body: payload,
    credentials: "include"
  });

  const normalized = normalizeResult(result as RawClientResult);
  return {
    ...normalized,
    thread: readAgentThread(normalized.data)
  };
}

export async function getAgentThread(request: Request, threadId: string) {
  const client = createCompassClient(request);
  const result = await client.GET("/v1/agent/threads/{threadId}", {
    params: {
      path: {
        threadId
      }
    },
    credentials: "include"
  });

  const normalized = normalizeResult(result as RawClientResult);
  return {
    ...normalized,
    thread: readAgentThread(normalized.data)
  };
}

export async function switchAgentThreadMode(
  request: Request,
  payload: {
    threadId: string;
    executionMode: "cloud" | "local";
  }
) {
  const client = createCompassClient(request);
  const result = await client.PATCH("/v1/agent/threads/{threadId}/mode", {
    params: {
      path: {
        threadId: payload.threadId
      }
    },
    body: {
      executionMode: payload.executionMode
    },
    credentials: "include"
  });

  const normalized = normalizeResult(result as RawClientResult);
  return {
    ...normalized,
    thread: readAgentThread(normalized.data)
  };
}

export async function startAgentTurn(
  request: Request,
  payload: {
    threadId: string;
    text: string;
    executionMode?: "cloud" | "local";
  }
) {
  const client = createCompassClient(request);
  const result = await client.POST("/v1/agent/threads/{threadId}/turns", {
    params: {
      path: {
        threadId: payload.threadId
      }
    },
    body: {
      text: payload.text,
      executionMode: payload.executionMode
    },
    credentials: "include"
  });

  const normalized = normalizeResult(result as RawClientResult);
  return {
    ...normalized,
    turn: readTurnResult(normalized.data)
  };
}

export async function appendAgentEventsBatch(
  request: Request,
  payload: {
    threadId: string;
    events: Array<{
      turnId?: string;
      method: string;
      payload: Record<string, unknown>;
    }>;
  }
) {
  const client = createCompassClient(request);
  const result = await client.POST("/v1/agent/threads/{threadId}/events:batch", {
    params: {
      path: {
        threadId: payload.threadId
      }
    },
    body: {
      events: payload.events
    },
    credentials: "include"
  });

  return normalizeResult(result as RawClientResult);
}
