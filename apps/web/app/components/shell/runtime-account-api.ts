import {
  RuntimeAccountLoginStartRequestSchema,
  RuntimeAccountLoginStartResponseSchema,
  RuntimeAccountRateLimitsReadResponseSchema,
  RuntimeAccountReadResponseSchema,
  RuntimeNotificationSchema,
  type RuntimeAccountLoginStartRequest,
  type RuntimeAccountLoginStartResponse,
  type RuntimeAccountRateLimitsReadResponse,
  type RuntimeAccountReadResponse,
  type RuntimeNotification
} from "@compass/contracts";

export type RuntimeAccountState = RuntimeAccountReadResponse;
export type RuntimeRateLimitsState = RuntimeAccountRateLimitsReadResponse;
export type RuntimeLoginStartResponse = RuntimeAccountLoginStartResponse;

export class RuntimeAccountRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RuntimeAccountRequestError";
    this.code = code;
  }
}

export function normalizeRequestError(
  error: unknown,
  fallback: string
): RuntimeAccountRequestError {
  if (error instanceof RuntimeAccountRequestError) {
    return error;
  }

  if (error instanceof Error) {
    const codeCandidate = (error as { code?: unknown }).code;
    const code = typeof codeCandidate === "string" ? codeCandidate : "UNKNOWN_ERROR";
    return new RuntimeAccountRequestError(code, error.message || fallback);
  }

  if (!error || typeof error !== "object") {
    return new RuntimeAccountRequestError("UNKNOWN_ERROR", fallback);
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "UNKNOWN_ERROR";
  const message =
    typeof candidate.message === "string" && candidate.message.trim().length > 0
      ? candidate.message
      : fallback;
  return new RuntimeAccountRequestError(code, message);
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export async function fetchRuntimeAccountRead(refreshToken = false): Promise<RuntimeAccountState> {
  const response = await fetch("/v1/agent/runtime/account/read", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ refreshToken })
  });
  const payload = await readResponseJson(response);
  if (!response.ok) {
    throw normalizeRequestError(payload, "Unable to load runtime account state.");
  }
  return RuntimeAccountReadResponseSchema.parse(payload);
}

export async function postRuntimeLoginStart(
  payload: RuntimeAccountLoginStartRequest
): Promise<RuntimeLoginStartResponse> {
  const requestPayload = RuntimeAccountLoginStartRequestSchema.parse(payload);
  const response = await fetch("/v1/agent/runtime/account/login/start", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(requestPayload)
  });
  const body = await readResponseJson(response);
  if (!response.ok) {
    throw normalizeRequestError(body, "Unable to start runtime login.");
  }
  return RuntimeAccountLoginStartResponseSchema.parse(body);
}

export async function postRuntimeLoginCancel(loginId: string): Promise<void> {
  const response = await fetch("/v1/agent/runtime/account/login/cancel", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ loginId })
  });
  const payload = await readResponseJson(response);
  if (!response.ok) {
    throw normalizeRequestError(payload, "Unable to cancel runtime login.");
  }
}

export async function postRuntimeLogout(): Promise<void> {
  const response = await fetch("/v1/agent/runtime/account/logout", {
    method: "POST",
    credentials: "include"
  });
  const payload = await readResponseJson(response);
  if (!response.ok) {
    throw normalizeRequestError(payload, "Unable to logout runtime account.");
  }
}

export async function postRuntimeRateLimitsRead(): Promise<RuntimeRateLimitsState> {
  const response = await fetch("/v1/agent/runtime/account/rate-limits/read", {
    method: "POST",
    credentials: "include"
  });
  const payload = await readResponseJson(response);
  if (!response.ok) {
    throw normalizeRequestError(payload, "Unable to read runtime rate limits.");
  }
  return RuntimeAccountRateLimitsReadResponseSchema.parse(payload);
}

export function subscribeRuntimeStream(onEvent: (event: RuntimeNotification) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/v1/agent/runtime/stream`);

  ws.onmessage = (event) => {
    try {
      const payload = RuntimeNotificationSchema.safeParse(JSON.parse(String(event.data ?? "")));
      if (payload.success) {
        onEvent(payload.data);
      }
    } catch {
      // ignore malformed runtime stream events
    }
  };

  return () => {
    ws.close();
  };
}
