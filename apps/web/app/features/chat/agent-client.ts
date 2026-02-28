import { createApiClient } from "@compass/sdk";
import {
  AgentEventSchema,
  AgentEventsBatchResponseSchema,
  AgentEventsListResponseSchema,
  AgentThreadCreateResponseSchema,
  AgentThreadDeleteResponseSchema,
  AgentThreadListResponseSchema,
  AgentThreadModePatchResponseSchema,
  AgentThreadPatchResponseSchema,
  AgentThreadReadResponseSchema,
  AgentTurnInterruptResponseSchema,
  AgentTurnStartResponseSchema,
  type AgentTurnInterruptResponse,
  type AgentTurnStartResponse
} from "@compass/contracts";
import type { ZodType } from "zod";
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
  DELETE(path: string, options?: Record<string, unknown>): Promise<RawClientResult>;
}

interface ApiResult<T> {
  status: number;
  data: T | null;
  error: unknown;
  message: string | null;
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

function resolveBrowserBaseUrl(baseUrl?: string): string {
  if (baseUrl && baseUrl.trim().length > 0) {
    return baseUrl;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizeApiResult<TPayload, TResult>({
  result,
  schema,
  select
}: {
  result: RawClientResult;
  schema: ZodType<TPayload>;
  select: (payload: TPayload) => TResult;
}): ApiResult<TResult> {
  const parsed = schema.safeParse(result.data);

  return {
    status: result.response.status,
    data: parsed.success ? select(parsed.data) : null,
    error: result.error ?? null,
    message: readApiErrorMessage(result.error, "")
  };
}

function toTurnWithOutputText(payload: AgentTurnStartResponse): AgentTurn {
  return {
    ...payload.turn,
    outputText: payload.outputText ?? null
  };
}

function toInterruptTurnWithOutputText(payload: AgentTurnInterruptResponse): AgentTurn {
  return {
    ...payload.turn,
    outputText: null
  };
}

function toEventsResult(payload: { events: AgentEvent[] }): AgentEventsResult {
  const nextCursor = payload.events.reduce((cursor, event) => Math.max(cursor, event.cursor), 0);
  return {
    events: payload.events,
    nextCursor
  };
}

export async function createAgentThread(
  request: Request,
  payload: {
    workspaceSlug: string;
    executionMode: AgentExecutionMode;
    title?: string;
  }
): Promise<ApiResult<AgentThread>> {
  const client = createRouteClient(request);
  const result = await client.POST("/v1/agent/threads", {
    credentials: "include",
    body: {
      workspaceSlug: payload.workspaceSlug,
      executionMode: payload.executionMode,
      title: payload.title
    }
  });

  return normalizeApiResult({
    result,
    schema: AgentThreadCreateResponseSchema,
    select: (parsed) => parsed.thread
  });
}

export async function listAgentThreads(
  request: Request,
  payload: {
    workspaceSlug: string;
    state?: "regular" | "archived" | "all";
    limit?: number;
  }
): Promise<ApiResult<AgentThread[]>> {
  const client = createRouteClient(request);
  const result = await client.GET("/v1/agent/threads", {
    credentials: "include",
    params: {
      query: {
        workspaceSlug: payload.workspaceSlug,
        state: payload.state,
        limit: payload.limit
      }
    }
  });

  return normalizeApiResult({
    result,
    schema: AgentThreadListResponseSchema,
    select: (parsed) => parsed.threads
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
    schema: AgentThreadReadResponseSchema,
    select: (parsed) => parsed.thread
  });
}

export async function listAgentThreadsClient(payload: {
  workspaceSlug: string;
  state?: "regular" | "archived" | "all";
  limit?: number;
  baseUrl?: string;
}): Promise<AgentThread[]> {
  const client = createBrowserClient(resolveBrowserBaseUrl(payload.baseUrl));
  const result = await client.GET("/v1/agent/threads", {
    credentials: "include",
    params: {
      query: {
        workspaceSlug: payload.workspaceSlug,
        state: payload.state,
        limit: payload.limit
      }
    }
  });

  if (result.response.status >= 400) {
    throw new Error(readApiErrorMessage(result.error, "Unable to load chat threads."));
  }

  const parsed = AgentThreadListResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.threads;
}

export async function patchAgentThreadClient(payload: {
  threadId: string;
  title?: string;
  archived?: boolean;
  baseUrl?: string;
}): Promise<AgentThread> {
  const client = createBrowserClient(resolveBrowserBaseUrl(payload.baseUrl));
  const result = await client.PATCH("/v1/agent/threads/{threadId}", {
    credentials: "include",
    params: {
      path: {
        threadId: payload.threadId
      }
    },
    body: {
      title: payload.title,
      archived: payload.archived
    }
  });

  if (result.response.status >= 400) {
    throw new Error(readApiErrorMessage(result.error, "Unable to update chat thread."));
  }

  const parsed = AgentThreadPatchResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new Error("Unable to update chat thread.");
  }

  return parsed.data.thread;
}

export async function deleteAgentThreadClient(payload: {
  threadId: string;
  baseUrl?: string;
}): Promise<{ deleted: true }> {
  const client = createBrowserClient(resolveBrowserBaseUrl(payload.baseUrl));
  const result = await client.DELETE("/v1/agent/threads/{threadId}", {
    credentials: "include",
    params: {
      path: {
        threadId: payload.threadId
      }
    }
  });

  if (result.response.status >= 400) {
    throw new Error(readApiErrorMessage(result.error, "Unable to delete chat thread."));
  }

  const parsed = AgentThreadDeleteResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new Error("Unable to delete chat thread.");
  }

  return parsed.data;
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
    schema: AgentThreadModePatchResponseSchema,
    select: (parsed) => parsed.thread
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
    schema: AgentTurnStartResponseSchema,
    select: (parsed) => toTurnWithOutputText(parsed)
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
    schema: AgentTurnInterruptResponseSchema,
    select: (parsed) => toInterruptTurnWithOutputText(parsed)
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
    schema: AgentEventsListResponseSchema,
    select: (parsed) => toEventsResult(parsed)
  });
}

export async function listAgentThreadEventsClient(payload: {
  threadId: string;
  cursor?: number;
  limit?: number;
  baseUrl?: string;
}): Promise<AgentEventsResult> {
  const client = createBrowserClient(resolveBrowserBaseUrl(payload.baseUrl));
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

  const parsed = AgentEventsListResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      events: [],
      nextCursor: 0
    };
  }

  return toEventsResult(parsed.data);
}

export async function appendAgentThreadEventsBatchClient(payload: {
  threadId: string;
  events: Array<{
    turnId?: string;
    method: string;
    payload: unknown;
  }>;
  baseUrl?: string;
}): Promise<{ accepted: number }> {
  const client = createBrowserClient(resolveBrowserBaseUrl(payload.baseUrl));
  const result = await client.POST("/v1/agent/threads/{threadId}/events:batch", {
    credentials: "include",
    params: {
      path: {
        threadId: payload.threadId
      }
    },
    body: {
      events: payload.events
    }
  });

  if (result.response.status >= 400) {
    throw new Error(readApiErrorMessage(result.error, "Unable to submit chat feedback."));
  }

  const parsed = AgentEventsBatchResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return { accepted: 0 };
  }

  return {
    accepted: parsed.data.accepted
  };
}

export function parseStreamEventPayload(payload: unknown): AgentEvent | null {
  const parsed = AgentEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
