import createClient from "openapi-fetch";
import type { ForbiddenError, UnauthorizedError } from "@compass/contracts";
import type { ApiPaths } from "./index.js";

export type ApiClient = ReturnType<typeof createApiClient>;

export interface CallerContext {
  tenantId: string;
  tokenType: "delegated" | "app";
  subjectType: "user" | "app";
  subjectId: string;
  actorClientId: string;
}

export interface TokenProviderContext {
  reason: "initial" | "refresh";
}

export interface ProvidedAccessToken {
  token: string;
  expiresAtEpochSeconds?: number;
}

export type TokenProvider = (
  context: TokenProviderContext
) => Promise<ProvidedAccessToken | null> | ProvidedAccessToken | null;

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  tokenProvider?: TokenProvider;
  throwOnAuthError?: boolean;
}

export class ApiAuthError extends Error {
  readonly status?: 401 | 403;
  readonly errorCode?: UnauthorizedError["code"] | ForbiddenError["code"];
  readonly details?: string;

  constructor(
    message: string,
    options?: {
      status?: 401 | 403;
      errorCode?: UnauthorizedError["code"] | ForbiddenError["code"];
      details?: string;
    }
  ) {
    super(message);
    this.name = "ApiAuthError";
    this.status = options?.status;
    this.errorCode = options?.errorCode;
    this.details = options?.details;
  }
}

export class ApiUnauthorizedError extends ApiAuthError {
  constructor(payload: UnauthorizedError, status: 401 = 401) {
    super(payload.message, {
      status,
      errorCode: payload.code,
      details: payload.message
    });
    this.name = "ApiUnauthorizedError";
  }
}

export class ApiForbiddenError extends ApiAuthError {
  constructor(payload: ForbiddenError, status: 403 = 403) {
    super(payload.message, {
      status,
      errorCode: payload.code,
      details: payload.message
    });
    this.name = "ApiForbiddenError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

export function parseApiAuthErrorResponse(response: Response, payload: unknown) {
  const data = asRecord(payload);
  if (!data) {
    return null;
  }

  const code = data.code;
  const message = data.message;
  if (typeof code !== "string" || typeof message !== "string") {
    return null;
  }

  if (response.status === 401 && (code === "invalid_token" || code === "token_unclassified")) {
    return new ApiUnauthorizedError({
      code,
      message
    });
  }

  if (
    response.status === 403 &&
    (code === "tenant_denied" || code === "assignment_denied" || code === "permission_denied")
  ) {
    return new ApiForbiddenError({
      code,
      message
    });
  }

  return null;
}

async function maybeThrowAuthError(response: Response, enabled: boolean) {
  if (!enabled || (response.status !== 401 && response.status !== 403)) {
    return;
  }

  let payload: unknown = null;
  try {
    payload = await response.clone().json();
  } catch {
    // Best effort parse for typed auth error details.
  }

  const parsed = parseApiAuthErrorResponse(response, payload);
  if (parsed) {
    throw parsed;
  }

  throw new ApiAuthError(`API request failed with status ${response.status}`, {
    status: response.status === 401 ? 401 : 403
  });
}

function shouldRefreshTokenOn401(response: Response) {
  if (response.status !== 401) {
    return false;
  }

  const challenge = response.headers.get("www-authenticate");
  if (!challenge) {
    return true;
  }

  return /invalid_token|expired|bearer/iu.test(challenge);
}

export function createApiClient({
  baseUrl,
  token,
  tokenProvider,
  throwOnAuthError = false
}: ApiClientOptions) {
  let cachedToken = token;
  let cachedExpiry = 0;

  async function resolveToken(reason: TokenProviderContext["reason"]) {
    if (tokenProvider) {
      const provided = await tokenProvider({ reason });
      if (provided?.token) {
        cachedToken = provided.token;
        cachedExpiry = provided.expiresAtEpochSeconds ?? 0;
      }
    }

    return cachedToken;
  }

  async function buildAuthHeaders(
    sourceHeaders: HeadersInit | undefined,
    reason: TokenProviderContext["reason"]
  ) {
    const headers = new Headers(sourceHeaders);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const shouldRefreshByExpiry = cachedExpiry > 0 && cachedExpiry <= nowSeconds + 30;
    const resolvedToken = await resolveToken(shouldRefreshByExpiry ? "refresh" : reason);
    if (!resolvedToken) {
      throw new ApiAuthError("No access token is available for API request");
    }

    headers.set("authorization", `Bearer ${resolvedToken}`);
    return headers;
  }

  return createClient<ApiPaths>({
    baseUrl,
    fetch: async (request: Request) => {
      const initialHeaders = await buildAuthHeaders(request.headers, "initial");
      const firstRequest = new Request(request, {
        headers: initialHeaders
      });
      const initialResponse = await fetch(firstRequest);

      if (!tokenProvider || !shouldRefreshTokenOn401(initialResponse)) {
        await maybeThrowAuthError(initialResponse, throwOnAuthError);
        return initialResponse;
      }

      const retryHeaders = await buildAuthHeaders(request.headers, "refresh");
      const retryRequest = new Request(request, {
        headers: retryHeaders
      });
      const retriedResponse = await fetch(retryRequest);
      await maybeThrowAuthError(retriedResponse, throwOnAuthError);
      return retriedResponse;
    }
  });
}
