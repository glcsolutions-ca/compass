"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StreamEvent } from "@compass/contracts";
import {
  createStreamState,
  readApprovalReason,
  reduceStreamEvent,
  type ApprovalRequest
} from "./codex/stream-state.js";
import { useCodexStream } from "./codex/useCodexStream";

function defaultApiBaseUrl() {
  return process.env.NEXT_PUBLIC_CODEX_API_BASE_URL?.trim() || "http://localhost:3010";
}

function defaultWsBaseUrl() {
  return process.env.NEXT_PUBLIC_CODEX_WS_BASE_URL?.trim() || "ws://localhost:3010";
}

interface AccountInfo {
  type?: string;
  email?: string;
  [key: string]: unknown;
}

export default function HomeClient() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [wsBaseUrl, setWsBaseUrl] = useState(defaultWsBaseUrl);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Summarize the workspace status and suggest next steps.");
  const [streamState, setStreamState] = useState(createStreamState);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "open" | "closed" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [oauthLoginId, setOauthLoginId] = useState<string | null>(null);
  const [oauthAuthUrl, setOauthAuthUrl] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState(false);

  const normalizedApiBaseUrl = useMemo(() => apiBaseUrl.replace(/\/+$/, ""), [apiBaseUrl]);
  const accountType = account?.type ?? "none";

  const appendEvent = useCallback((event: StreamEvent) => {
    setStreamState((previous) => reduceStreamEvent(previous, event));
  }, []);

  const onStreamStatus = useCallback((status: "connecting" | "open" | "closed" | "error") => {
    setConnectionStatus(status);
  }, []);

  useCodexStream(threadId, wsBaseUrl, appendEvent, onStreamStatus);

  const refreshAuthAccount = useCallback(async () => {
    const response = await fetch(`${normalizedApiBaseUrl}/v1/auth/account`);
    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new Error(body);
    }

    const payload = (await response.json()) as unknown;
    const nextAccount = readAccount(payload);
    setAccount(nextAccount);
    return nextAccount;
  }, [normalizedApiBaseUrl]);

  const loginWithApiKey = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setErrorMessage("Enter an API key.");
      return;
    }

    setAuthBusy(true);
    setErrorMessage(null);
    setAuthStatus(null);

    try {
      const response = await fetch(`${normalizedApiBaseUrl}/v1/auth/api-key/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ apiKey: trimmed })
      });

      if (!response.ok) {
        const body = await readErrorBody(response);
        throw new Error(body);
      }

      await refreshAuthAccount();
      setApiKey("");
      setOauthLoginId(null);
      setOauthAuthUrl(null);
      setOauthPending(false);
      setAuthStatus("API key login succeeded.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }, [apiKey, normalizedApiBaseUrl, refreshAuthAccount]);

  const startChatGptLogin = useCallback(async () => {
    setAuthBusy(true);
    setErrorMessage(null);
    setAuthStatus(null);

    try {
      const response = await fetch(`${normalizedApiBaseUrl}/v1/auth/chatgpt/login/start`, {
        method: "POST"
      });

      if (!response.ok) {
        const body = await readErrorBody(response);
        throw new Error(body);
      }

      const payload = (await response.json()) as unknown;
      const { loginId, authUrl } = readLoginStart(payload);
      const nextAccount = readAccount(payload);

      setAccount(nextAccount ?? account);
      setOauthLoginId(loginId ?? null);
      setOauthAuthUrl(authUrl ?? null);
      setOauthPending(true);
      setAuthStatus("ChatGPT login started. Finish sign-in in the opened browser tab.");

      if (authUrl) {
        window.open(authUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setOauthPending(false);
    } finally {
      setAuthBusy(false);
    }
  }, [account, normalizedApiBaseUrl]);

  const cancelChatGptLogin = useCallback(async () => {
    if (!oauthLoginId) {
      setAuthStatus("No pending ChatGPT login to cancel.");
      return;
    }

    setAuthBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${normalizedApiBaseUrl}/v1/auth/chatgpt/login/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ loginId: oauthLoginId })
      });

      if (!response.ok) {
        const body = await readErrorBody(response);
        throw new Error(body);
      }

      setOauthPending(false);
      setOauthLoginId(null);
      setOauthAuthUrl(null);
      setAuthStatus("ChatGPT login canceled.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }, [normalizedApiBaseUrl, oauthLoginId]);

  const logout = useCallback(async () => {
    setAuthBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${normalizedApiBaseUrl}/v1/auth/logout`, {
        method: "POST"
      });

      if (!response.ok) {
        const body = await readErrorBody(response);
        throw new Error(body);
      }

      setAccount(null);
      setOauthPending(false);
      setOauthLoginId(null);
      setOauthAuthUrl(null);
      setAuthStatus("Logged out.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(false);
    }
  }, [normalizedApiBaseUrl]);

  const logoutEnterpriseSso = useCallback(async () => {
    setAuthBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/entra/logout", {
        method: "POST"
      });

      if (!response.ok && !response.redirected) {
        const body = await readErrorBody(response);
        throw new Error(body);
      }

      window.location.assign(response.url || "/login");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setAuthBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextAccount = await refreshAuthAccount();
        if (cancelled) {
          return;
        }
        if (nextAccount?.type === "chatgpt") {
          setOauthPending(false);
          setOauthLoginId(null);
          setOauthAuthUrl(null);
        }
      } catch {
        // Keep UI usable even if account read fails on first load.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshAuthAccount]);

  useEffect(() => {
    if (!oauthPending) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 120;

    const interval = setInterval(() => {
      attempts += 1;
      void (async () => {
        try {
          const nextAccount = await refreshAuthAccount();
          if (cancelled) {
            return;
          }
          if (nextAccount?.type === "chatgpt") {
            setOauthPending(false);
            setOauthLoginId(null);
            setOauthAuthUrl(null);
            setAuthStatus("ChatGPT login connected.");
            return;
          }
          if (attempts >= maxAttempts) {
            setOauthPending(false);
            setAuthStatus("ChatGPT login timed out. Start login again if needed.");
          }
        } catch {
          if (attempts >= maxAttempts) {
            setOauthPending(false);
            setAuthStatus("ChatGPT login polling stopped due to repeated read failures.");
          }
        }
      })();
    }, 2_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [oauthPending, refreshAuthAccount]);

  const startThread = useCallback(async () => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${normalizedApiBaseUrl}/v1/threads/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const body = await readErrorBody(response);
        throw new Error(body);
      }

      const data = (await response.json()) as {
        thread?: {
          id?: string;
        };
      };

      const nextThreadId = data.thread?.id;
      if (!nextThreadId) {
        throw new Error("Gateway response did not include thread.id");
      }

      setThreadId(nextThreadId);
      setStreamState(createStreamState());
      setConnectionStatus("connecting");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }, [normalizedApiBaseUrl]);

  const startTurn = useCallback(async () => {
    if (!threadId) {
      setErrorMessage("Start a thread before sending a turn.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `${normalizedApiBaseUrl}/v1/threads/${encodeURIComponent(threadId)}/turns/start`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ text: prompt })
        }
      );

      if (!response.ok) {
        const body = await readErrorBody(response);
        throw new Error(body);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }, [normalizedApiBaseUrl, prompt, threadId]);

  const respondApproval = useCallback(
    async (requestId: string, decision: "accept" | "decline") => {
      setIsBusy(true);
      setErrorMessage(null);

      try {
        const response = await fetch(
          `${normalizedApiBaseUrl}/v1/approvals/${encodeURIComponent(requestId)}/respond`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({ decision })
          }
        );

        if (!response.ok) {
          const body = await readErrorBody(response);
          throw new Error(body);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setIsBusy(false);
      }
    },
    [normalizedApiBaseUrl]
  );

  return (
    <main>
      <h1>Compass Codex Gateway</h1>
      <p className="helper">Enterprise SSO access granted. Select a provider auth mode below.</p>

      <section className="panel">
        <h2>Authentication</h2>
        <p className="helper">
          mode: <code data-testid="codex-auth-mode">{accountType}</code>
          {account?.email ? ` (${account.email})` : ""}
        </p>

        <label>
          Bring your own API key
          <input
            data-testid="codex-auth-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.currentTarget.value)}
            placeholder="sk-..."
          />
        </label>

        <div className="actions">
          <button
            type="button"
            data-testid="codex-auth-api-key-login"
            onClick={loginWithApiKey}
            disabled={authBusy || !apiKey.trim()}
          >
            Login With API Key
          </button>
          <button
            type="button"
            data-testid="codex-auth-chatgpt-start"
            className="secondary"
            onClick={startChatGptLogin}
            disabled={authBusy}
          >
            Start ChatGPT OAuth
          </button>
          <button
            type="button"
            data-testid="codex-auth-chatgpt-cancel"
            className="secondary"
            onClick={cancelChatGptLogin}
            disabled={authBusy || !oauthLoginId}
          >
            Cancel OAuth
          </button>
          <button
            type="button"
            data-testid="codex-auth-refresh"
            className="secondary"
            onClick={() => {
              void refreshAuthAccount().catch((error: unknown) => {
                setErrorMessage(error instanceof Error ? error.message : String(error));
              });
            }}
            disabled={authBusy}
          >
            Refresh Account
          </button>
          <button
            type="button"
            data-testid="codex-auth-logout"
            className="secondary"
            onClick={logout}
            disabled={authBusy}
          >
            Logout
          </button>
          <button
            type="button"
            data-testid="codex-auth-entra-logout"
            className="secondary"
            onClick={() => {
              void logoutEnterpriseSso();
            }}
            disabled={authBusy}
          >
            Sign Out Enterprise SSO
          </button>
        </div>

        {oauthLoginId ? (
          <p className="helper">
            oauth login id: <code data-testid="codex-auth-login-id">{oauthLoginId}</code>
          </p>
        ) : null}
        {oauthAuthUrl ? (
          <p className="helper">
            <a href={oauthAuthUrl} target="_blank" rel="noreferrer noopener">
              Open ChatGPT OAuth Link
            </a>
          </p>
        ) : null}
        {oauthPending ? <p className="helper">Waiting for OAuth completion...</p> : null}
        {authStatus ? <p className="helper">{authStatus}</p> : null}
      </section>

      <section className="panel">
        <h2>Gateway Connection</h2>
        <label>
          API base URL
          <input
            data-testid="codex-api-base-url"
            value={apiBaseUrl}
            onChange={(event) => setApiBaseUrl(event.currentTarget.value)}
            placeholder="http://localhost:3010"
          />
        </label>
        <label>
          WebSocket base URL
          <input
            data-testid="codex-ws-base-url"
            value={wsBaseUrl}
            onChange={(event) => setWsBaseUrl(event.currentTarget.value)}
            placeholder="ws://localhost:3010"
          />
        </label>

        <div className="actions">
          <button
            type="button"
            data-testid="codex-start-thread"
            onClick={startThread}
            disabled={isBusy}
          >
            Start Thread
          </button>
          <code data-testid="codex-thread-id">{threadId ?? "no-thread"}</code>
          <span className="helper">stream: {threadId ? connectionStatus : "idle"}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Turn Input</h2>
        <textarea
          data-testid="codex-turn-input"
          rows={4}
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          placeholder="Type your turn input..."
        />
        <div className="actions">
          <button
            type="button"
            data-testid="codex-start-turn"
            onClick={startTurn}
            disabled={isBusy || !threadId || !prompt.trim()}
          >
            Start Turn
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Pending Approvals</h2>
        {streamState.pendingApprovals.length === 0 ? (
          <p className="helper">No approvals pending.</p>
        ) : (
          <ul className="approval-list">
            {streamState.pendingApprovals.map((approval: ApprovalRequest) => (
              <li key={approval.requestId}>
                <code>{approval.requestId}</code>
                <p className="helper">{readApprovalReason(approval.payload)}</p>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() => respondApproval(approval.requestId, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => respondApproval(approval.requestId, "decline")}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Event Stream</h2>
        <pre data-testid="codex-event-stream">{JSON.stringify(streamState.events, null, 2)}</pre>
      </section>

      {errorMessage ? <p className="helper error">{errorMessage}</p> : null}
    </main>
  );
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { code?: string; message?: string };
    if (payload?.message) {
      return payload.message;
    }
  } catch {
    // noop
  }

  return `Request failed with status ${response.status}`;
}

function readAccount(payload: unknown): AccountInfo | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const account = (payload as Record<string, unknown>).account;
  if (!account || typeof account !== "object") {
    return null;
  }

  return account as AccountInfo;
}

function readLoginStart(payload: unknown): { loginId?: string; authUrl?: string } {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const loginId = typeof record.loginId === "string" ? record.loginId : undefined;
  const authUrl = typeof record.authUrl === "string" ? record.authUrl : undefined;

  return {
    loginId,
    authUrl
  };
}
