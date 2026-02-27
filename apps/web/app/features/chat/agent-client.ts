import { createApiClient } from "@compass/sdk";
import { createCompassClient, readApiErrorMessage } from "~/lib/api/compass-client";
import type {
  AgentEvent,
  AgentEventsResult,
  AgentExecutionMode,
  AgentThread,
  AgentTurn
} from "./agent-types";

interface RawClientResult {
  response: Response;
  data?: unknown;
  error?: unknown;
}

interface UntypedApiClient {
  GET(path: string, options?: Record<string, unknown>): Promise<RawClientResult>;
  POST(path: string, options?: Record<string, unknown>): Promise<RawClientResult>;
  PATCH(path: string, options?: Record<string, unknown>): Promise<RawClientResult>;
}

interface ApiResult<T> {
  status: number;
  data: T | null;
  error: unknown;
  message: string | null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readIsoDate(value: unknown): string | null {
  const candidate = readString(value);
  if (!candidate) {
    return null;
  }

  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function normalizeExecutionMode(value: unknown): AgentExecutionMode {
  return value === "local" ? "local" : "cloud";
}

function normalizeExecutionHost(value: unknown): AgentThread["executionHost"] {
  if (value === "desktop_local") {
    return "desktop_local";
  }

  return "dynamic_sessions";
}

function normalizeThreadStatus(value: unknown): AgentThread["status"] {
  if (
    value === "idle" ||
    value === "inProgress" ||
    value === "completed" ||
    value === "interrupted" ||
    value === "error"
  ) {
    return value;
  }

  return "idle";
}

function parseAgentThreadPayload(data: unknown): AgentThread | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const rawThread = (data as { thread?: unknown }).thread;
  if (!rawThread || typeof rawThread !== "object") {
    return null;
  }

  const threadId = readString((rawThread as { threadId?: unknown }).threadId);
  if (!threadId) {
    return null;
  }

  return {
    threadId,
    tenantId: readString((rawThread as { tenantId?: unknown }).tenantId),
    tenantSlug: readString((rawThread as { tenantSlug?: unknown }).tenantSlug),
    executionMode: normalizeExecutionMode((rawThread as { executionMode?: unknown }).executionMode),
    executionHost: normalizeExecutionHost((rawThread as { executionHost?: unknown }).executionHost),
    status: normalizeThreadStatus((rawThread as { status?: unknown }).status),
    cloudSessionIdentifier: readString(
      (rawThread as { cloudSessionIdentifier?: unknown }).cloudSessionIdentifier
    ),
    title: readString((rawThread as { title?: unknown }).title),
    createdAt: readIsoDate((rawThread as { createdAt?: unknown }).createdAt),
    updatedAt: readIsoDate((rawThread as { updatedAt?: unknown }).updatedAt),
    modeSwitchedAt: readIsoDate((rawThread as { modeSwitchedAt?: unknown }).modeSwitchedAt)
  };
}

function parseTurnPayload(data: unknown): AgentTurn | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const rawTurn = (data as { turn?: unknown }).turn;
  if (!rawTurn || typeof rawTurn !== "object") {
    return null;
  }

  const threadId = readString((rawTurn as { threadId?: unknown }).threadId);
  const turnId = readString((rawTurn as { turnId?: unknown }).turnId);
  if (!threadId || !turnId) {
    return null;
  }

  const rawOutputText = (data as { outputText?: unknown }).outputText;
  const outputText = typeof rawOutputText === "string" ? rawOutputText : null;

  return {
    turnId,
    threadId,
    status: normalizeThreadStatus((rawTurn as { status?: unknown }).status),
    executionMode: normalizeExecutionMode((rawTurn as { executionMode?: unknown }).executionMode),
    executionHost: normalizeExecutionHost((rawTurn as { executionHost?: unknown }).executionHost),
    input: (rawTurn as { input?: unknown }).input ?? null,
    output: (rawTurn as { output?: unknown }).output ?? null,
    error: (rawTurn as { error?: unknown }).error ?? null,
    startedAt: readIsoDate((rawTurn as { startedAt?: unknown }).startedAt),
    completedAt: readIsoDate((rawTurn as { completedAt?: unknown }).completedAt),
    outputText
  };
}

function parseAgentEvent(eventCandidate: unknown): AgentEvent | null {
  if (!eventCandidate || typeof eventCandidate !== "object") {
    return null;
  }

  const cursor = Number((eventCandidate as { cursor?: unknown }).cursor);
  const threadId = readString((eventCandidate as { threadId?: unknown }).threadId);
  const method = readString((eventCandidate as { method?: unknown }).method);
  const createdAt = readIsoDate((eventCandidate as { createdAt?: unknown }).createdAt);

  if (!Number.isInteger(cursor) || cursor < 0 || !threadId || !method || !createdAt) {
    return null;
  }

  return {
    cursor,
    threadId,
    turnId: readString((eventCandidate as { turnId?: unknown }).turnId),
    method,
    payload: (eventCandidate as { payload?: unknown }).payload ?? null,
    createdAt
  };
}

function parseEventsPayload(data: unknown): AgentEventsResult {
  if (!data || typeof data !== "object") {
    return {
      events: [],
      nextCursor: 0
    };
  }

  const rawEvents = (data as { events?: unknown }).events;
  if (!Array.isArray(rawEvents)) {
    return {
      events: [],
      nextCursor: 0
    };
  }

  const events = rawEvents.map((event) => parseAgentEvent(event)).filter((event) => event !== null);
  const nextCursor = events.reduce((cursor, event) => Math.max(cursor, event.cursor), 0);
  return {
    events,
    nextCursor
  };
}

function normalizeApiResult<T>({
  result,
  parser
}: {
  result: RawClientResult;
  parser: (data: unknown) => T | null;
}): ApiResult<T> {
  return {
    status: result.response.status,
    data: parser(result.data),
    error: result.error ?? null,
    message: readApiErrorMessage(result.error, "")
  };
}

function createRouteClient(request: Request): UntypedApiClient {
  return createCompassClient(request) as unknown as UntypedApiClient;
}

function createBrowserClient(baseUrl: string): UntypedApiClient {
  return createApiClient({
    baseUrl,
    fetch: globalThis.fetch.bind(globalThis)
  }) as unknown as UntypedApiClient;
}

export async function createAgentThread(
  request: Request,
  payload: {
    tenantSlug: string;
    executionMode: AgentExecutionMode;
    title?: string;
  }
): Promise<ApiResult<AgentThread>> {
  const client = createRouteClient(request);
  const result = await client.POST("/v1/agent/threads", {
    credentials: "include",
    body: {
      tenantSlug: payload.tenantSlug,
      executionMode: payload.executionMode,
      title: payload.title
    }
  });

  return normalizeApiResult({
    result,
    parser: parseAgentThreadPayload
  });
}

export async function getAgentThread(
  request: Request,
  threadId: string
): Promise<ApiResult<AgentThread>> {
  const client = createRouteClient(request);
  const result = await client.GET("/v1/agent/threads/{threadId}", {
    credentials: "include",
    params: {
      path: {
        threadId
      }
    }
  });

  return normalizeApiResult({
    result,
    parser: parseAgentThreadPayload
  });
}

export async function switchAgentThreadMode(
  request: Request,
  payload: {
    threadId: string;
    executionMode: AgentExecutionMode;
  }
): Promise<ApiResult<AgentThread>> {
  const client = createRouteClient(request);
  const result = await client.PATCH("/v1/agent/threads/{threadId}/mode", {
    credentials: "include",
    params: {
      path: {
        threadId: payload.threadId
      }
    },
    body: {
      executionMode: payload.executionMode
    }
  });

  return normalizeApiResult({
    result,
    parser: parseAgentThreadPayload
  });
}

export async function startAgentTurn(
  request: Request,
  payload: {
    threadId: string;
    text: string;
    executionMode?: AgentExecutionMode;
  }
): Promise<ApiResult<AgentTurn>> {
  const client = createRouteClient(request);
  const result = await client.POST("/v1/agent/threads/{threadId}/turns", {
    credentials: "include",
    params: {
      path: {
        threadId: payload.threadId
      }
    },
    body: {
      text: payload.text,
      executionMode: payload.executionMode
    }
  });

  return normalizeApiResult({
    result,
    parser: parseTurnPayload
  });
}

export async function interruptAgentTurn(
  request: Request,
  payload: { threadId: string; turnId: string }
): Promise<ApiResult<AgentTurn>> {
  const client = createRouteClient(request);
  const result = await client.POST("/v1/agent/threads/{threadId}/turns/{turnId}/interrupt", {
    credentials: "include",
    params: {
      path: {
        threadId: payload.threadId,
        turnId: payload.turnId
      }
    }
  });

  return normalizeApiResult({
    result,
    parser: parseTurnPayload
  });
}

export async function listAgentThreadEvents(
  request: Request,
  payload: {
    threadId: string;
    cursor?: number;
    limit?: number;
  }
): Promise<ApiResult<AgentEventsResult>> {
  const client = createRouteClient(request);
  const result = await client.GET("/v1/agent/threads/{threadId}/events", {
    credentials: "include",
    params: {
      path: {
        threadId: payload.threadId
      },
      query: {
        cursor: payload.cursor ?? 0,
        limit: payload.limit ?? 300
      }
    }
  });

  return normalizeApiResult({
    result,
    parser: (data) => parseEventsPayload(data)
  });
}

export async function listAgentThreadEventsClient(payload: {
  threadId: string;
  cursor?: number;
  limit?: number;
  baseUrl?: string;
}): Promise<AgentEventsResult> {
  const baseUrl = payload.baseUrl ?? window.location.origin;
  const client = createBrowserClient(baseUrl);
  const result = await client.GET("/v1/agent/threads/{threadId}/events", {
    credentials: "include",
    params: {
      path: {
        threadId: payload.threadId
      },
      query: {
        cursor: payload.cursor ?? 0,
        limit: payload.limit ?? 200
      }
    }
  });

  if (result.response.status >= 400) {
    throw new Error(readApiErrorMessage(result.error, "Unable to load chat events."));
  }

  return parseEventsPayload(result.data);
}

export function parseStreamEventPayload(payload: unknown): AgentEvent | null {
  return parseAgentEvent(payload);
}
