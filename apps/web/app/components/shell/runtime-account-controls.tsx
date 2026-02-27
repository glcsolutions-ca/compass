import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, KeyRound, Link2, Loader2, LogOut, RefreshCw, Shield } from "lucide-react";
import {
  RuntimeAccountLoginStartRequestSchema,
  RuntimeAccountLoginStartResponseSchema,
  RuntimeAccountRateLimitsReadResponseSchema,
  RuntimeAccountReadResponseSchema,
  RuntimeNotificationSchema,
  type RuntimeAccountLoginCancelResponse,
  type RuntimeAccountLoginStartRequest,
  type RuntimeAccountLoginStartResponse,
  type RuntimeAccountLogoutResponse,
  type RuntimeAccountRateLimitsReadResponse,
  type RuntimeAccountReadResponse,
  type RuntimeNotification,
  type RuntimeRateLimitSnapshot
} from "@compass/contracts";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils/cn";

type RuntimeAccountState = RuntimeAccountReadResponse;
type RuntimeRateLimitsState = RuntimeAccountRateLimitsReadResponse;
type RuntimeLoginStartResponse = RuntimeAccountLoginStartResponse;

class RuntimeAccountRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RuntimeAccountRequestError";
    this.code = code;
  }
}

interface DesktopRuntimeApi {
  localAuthStart: (input: {
    mode: "chatgpt" | "apiKey";
    apiKey?: string;
  }) => Promise<RuntimeLoginStartResponse>;
  localAuthStatus: () => Promise<RuntimeAccountState>;
  localAuthLogout: () => Promise<RuntimeAccountLogoutResponse>;
  localAuthCancel?: (input: { loginId: string }) => Promise<RuntimeAccountLoginCancelResponse>;
  localRateLimitsRead?: () => Promise<RuntimeRateLimitsState>;
  onRuntimeNotification?: (listener: (event: RuntimeNotification) => void) => () => void;
  openExternal?: (url: string) => Promise<void>;
}

const LOCAL_DEFAULT_STATE: RuntimeAccountState = {
  provider: "local_process",
  capabilities: {
    interactiveAuth: true,
    supportsChatgptManaged: true,
    supportsApiKey: true,
    supportsChatgptAuthTokens: false,
    supportsRateLimits: false,
    supportsRuntimeStream: false
  },
  authMode: null,
  requiresOpenaiAuth: true,
  account: null
};

function readDesktopRuntimeApi(): DesktopRuntimeApi | null {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = (window as { compassDesktop?: unknown }).compassDesktop;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const desktopApi = candidate as DesktopRuntimeApi;
  if (
    typeof desktopApi.localAuthStart !== "function" ||
    typeof desktopApi.localAuthStatus !== "function" ||
    typeof desktopApi.localAuthLogout !== "function"
  ) {
    return null;
  }

  return desktopApi;
}

function normalizeRequestError(error: unknown, fallback: string): RuntimeAccountRequestError {
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

async function fetchRuntimeAccountRead(refreshToken = false): Promise<RuntimeAccountState> {
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

async function postRuntimeLoginStart(
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

async function postRuntimeLoginCancel(loginId: string): Promise<void> {
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

async function postRuntimeLogout(): Promise<void> {
  const response = await fetch("/v1/agent/runtime/account/logout", {
    method: "POST",
    credentials: "include"
  });
  const payload = await readResponseJson(response);
  if (!response.ok) {
    throw normalizeRequestError(payload, "Unable to logout runtime account.");
  }
}

async function postRuntimeRateLimitsRead(): Promise<RuntimeRateLimitsState> {
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

function subscribeRuntimeStream(onEvent: (event: RuntimeNotification) => void): () => void {
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

function resolveConnectedLabel(state: RuntimeAccountState | null): string {
  if (!state) {
    return "Checking runtime account...";
  }

  const label = state.account?.label?.trim();
  if (label) {
    return `Connected as ${label}`;
  }

  if (state.authMode) {
    return `Connected (${state.authMode})`;
  }

  return state.requiresOpenaiAuth ? "Not connected" : "Provider-managed runtime";
}

function formatResetTime(unixSeconds: number | null): string {
  if (!unixSeconds) {
    return "n/a";
  }
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function RateLimitCard({ label, snapshot }: { label: string; snapshot: RuntimeRateLimitSnapshot }) {
  const usedPercent = Math.max(0, Math.min(100, Number(snapshot.primary?.usedPercent ?? 0)));
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{usedPercent.toFixed(0)}%</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Resets {formatResetTime(snapshot.primary?.resetsAt ?? null)}
      </p>
    </div>
  );
}

export function RuntimeAccountControls() {
  const desktopApi = useMemo(() => readDesktopRuntimeApi(), []);
  const [state, setState] = useState<RuntimeAccountState | null>(null);
  const [rateLimits, setRateLimits] = useState<RuntimeRateLimitsState | null>(null);
  const [pendingLoginId, setPendingLoginId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [chatgptAccountId, setChatgptAccountId] = useState("");
  const [chatgptPlanType, setChatgptPlanType] = useState("");

  const providerManaged = state?.provider === "dynamic_sessions";
  const interactiveAuthEnabled = state?.capabilities.interactiveAuth === true;
  const canUseApiKey = state?.capabilities.supportsApiKey === true;
  const canUseChatgpt = state?.capabilities.supportsChatgptManaged === true;
  const canUseExternalTokens = state?.capabilities.supportsChatgptAuthTokens === true;

  const refreshState = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (desktopApi) {
        const desktopStatus = await desktopApi.localAuthStatus();
        setState(desktopStatus);

        if (desktopApi.localRateLimitsRead) {
          setRateLimits(await desktopApi.localRateLimitsRead());
        } else {
          setRateLimits(null);
        }
      } else {
        const nextState = await fetchRuntimeAccountRead(false);
        setState(nextState);
        if (nextState.capabilities.supportsRateLimits) {
          setRateLimits(await postRuntimeRateLimitsRead());
        } else {
          setRateLimits(null);
        }
      }
    } catch (error) {
      const normalized = normalizeRequestError(error, "Unable to load runtime account state.");
      setErrorMessage(normalized.message);
      setState(LOCAL_DEFAULT_STATE);
      setRateLimits(null);
    } finally {
      setLoading(false);
    }
  }, [desktopApi]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    if (desktopApi && typeof desktopApi.onRuntimeNotification === "function") {
      return desktopApi.onRuntimeNotification(() => {
        void refreshState();
      });
    }

    if (!state?.capabilities.supportsRuntimeStream) {
      return;
    }

    const unsubscribe = subscribeRuntimeStream(() => {
      void refreshState();
    });
    return unsubscribe;
  }, [desktopApi, refreshState, state?.capabilities.supportsRuntimeStream]);

  const startChatgptLogin = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      if (desktopApi) {
        const status = await desktopApi.localAuthStart({ mode: "chatgpt" });
        setPendingLoginId(null);
        if (status.authUrl && desktopApi.openExternal) {
          await desktopApi.openExternal(status.authUrl);
        }
        await refreshState();
        return;
      }

      const result = await postRuntimeLoginStart({ type: "chatgpt" });
      setPendingLoginId(result.loginId ?? null);
      if (result.authUrl) {
        window.open(result.authUrl, "_blank", "noopener,noreferrer");
      }
      await refreshState();
    } catch (error) {
      setErrorMessage(normalizeRequestError(error, "Unable to start ChatGPT login.").message);
    } finally {
      setBusy(false);
    }
  };

  const startApiKeyLogin = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setErrorMessage("Enter an API key first.");
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    try {
      if (desktopApi) {
        await desktopApi.localAuthStart({ mode: "apiKey", apiKey: trimmed });
      } else {
        await postRuntimeLoginStart({ type: "apiKey", apiKey: trimmed });
      }
      setApiKey("");
      setPendingLoginId(null);
      await refreshState();
    } catch (error) {
      setErrorMessage(normalizeRequestError(error, "Unable to authenticate with API key.").message);
    } finally {
      setBusy(false);
    }
  };

  const startExternalTokenLogin = async () => {
    const token = accessToken.trim();
    const accountId = chatgptAccountId.trim();
    if (!token || !accountId) {
      setErrorMessage("Access token and ChatGPT account id are required.");
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    try {
      await postRuntimeLoginStart({
        type: "chatgptAuthTokens",
        accessToken: token,
        chatgptAccountId: accountId,
        chatgptPlanType: chatgptPlanType.trim() || null
      });
      setAccessToken("");
      setChatgptAccountId("");
      setChatgptPlanType("");
      setPendingLoginId(null);
      await refreshState();
    } catch (error) {
      setErrorMessage(normalizeRequestError(error, "Unable to apply external tokens.").message);
    } finally {
      setBusy(false);
    }
  };

  const cancelLogin = async () => {
    if (!pendingLoginId) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    try {
      if (desktopApi?.localAuthCancel) {
        await desktopApi.localAuthCancel({ loginId: pendingLoginId });
      } else {
        await postRuntimeLoginCancel(pendingLoginId);
      }
      setPendingLoginId(null);
      await refreshState();
    } catch (error) {
      setErrorMessage(normalizeRequestError(error, "Unable to cancel runtime login.").message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      if (desktopApi) {
        await desktopApi.localAuthLogout();
      } else {
        await postRuntimeLogout();
      }
      setPendingLoginId(null);
      await refreshState();
    } catch (error) {
      setErrorMessage(
        normalizeRequestError(error, "Unable to disconnect runtime account.").message
      );
    } finally {
      setBusy(false);
    }
  };

  const connected = Boolean(state?.authMode) || (!state?.requiresOpenaiAuth && !!state);
  const connectedLabel = resolveConnectedLabel(state);
  const rateLimitEntries = useMemo(() => {
    if (!rateLimits) {
      return [];
    }

    if (rateLimits.rateLimitsByLimitId) {
      return Object.entries(rateLimits.rateLimitsByLimitId)
        .filter(([, snapshot]) => Boolean(snapshot))
        .map(([key, snapshot]) => [key, snapshot as RuntimeRateLimitSnapshot] as const);
    }

    if (rateLimits.rateLimits) {
      const key = rateLimits.rateLimits.limitId || "primary";
      return [[key, rateLimits.rateLimits] as const];
    }

    return [];
  }, [rateLimits]);

  return (
    <section
      aria-label="Runtime account settings"
      className="space-y-4 rounded-xl border border-border/70 p-4"
    >
      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-tight text-foreground">Runtime account</h3>
        <p className="text-sm text-muted-foreground">
          Connect the Codex runtime to ChatGPT or an API key for local runtime providers.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {loading ? "Checking runtime state..." : connectedLabel}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Provider: {state?.provider ?? "unknown"}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            connected
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {providerManaged ? (
        <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Runtime credentials are managed by environment configuration for this provider.</p>
        </div>
      ) : null}

      {pendingLoginId ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>ChatGPT login is in progress.</span>
          <Button
            disabled={busy}
            onClick={() => {
              void cancelLogin();
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || loading || !interactiveAuthEnabled || !canUseChatgpt}
          onClick={() => {
            void startChatgptLogin();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Link2 className="mr-1.5 h-4 w-4" />
          Connect ChatGPT
        </Button>

        <Button
          disabled={busy || loading || !connected}
          onClick={() => {
            void disconnect();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <LogOut className="mr-1.5 h-4 w-4" />
          Disconnect
        </Button>

        <Button
          disabled={busy}
          onClick={() => {
            void refreshState();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-2">
        <label
          className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          htmlFor="runtime-api-key"
        >
          API key
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            autoComplete="off"
            id="runtime-api-key"
            onChange={(event) => {
              setApiKey(event.target.value);
            }}
            placeholder="sk-..."
            type="password"
            value={apiKey}
          />
          <Button
            className="sm:w-auto"
            disabled={busy || loading || !interactiveAuthEnabled || !canUseApiKey}
            onClick={() => {
              void startApiKeyLogin();
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            <KeyRound className="mr-1.5 h-4 w-4" />
            Use API key
          </Button>
        </div>
      </div>

      {canUseExternalTokens ? (
        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            External ChatGPT tokens
          </p>
          <Input
            autoComplete="off"
            onChange={(event) => {
              setAccessToken(event.target.value);
            }}
            placeholder="Access token"
            type="password"
            value={accessToken}
          />
          <Input
            autoComplete="off"
            onChange={(event) => {
              setChatgptAccountId(event.target.value);
            }}
            placeholder="ChatGPT account id"
            value={chatgptAccountId}
          />
          <Input
            autoComplete="off"
            onChange={(event) => {
              setChatgptPlanType(event.target.value);
            }}
            placeholder="Plan type (optional)"
            value={chatgptPlanType}
          />
          <Button
            disabled={busy || loading || !interactiveAuthEnabled}
            onClick={() => {
              void startExternalTokenLogin();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Apply external tokens
          </Button>
        </div>
      ) : null}

      {rateLimitEntries.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Rate limits
          </p>
          <div className="grid gap-2">
            {rateLimitEntries.map(([key, snapshot]) => (
              <RateLimitCard
                key={key}
                label={snapshot.limitName || snapshot.limitId || key}
                snapshot={snapshot}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
