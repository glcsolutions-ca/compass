import type { MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { createApiClient } from "@compass/sdk";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { submitChatAction, type ChatActionData } from "~/features/chat/chat-action";
import { loadChatData, type ChatLoaderData } from "~/features/chat/chat-loader";
import type { ShellRouteHandle } from "~/features/auth/types";

export const meta: MetaFunction = () => {
  return [{ title: "Compass Chat" }];
};

export const handle: ShellRouteHandle = {
  requiresAuth: true,
  navLabel: "Chat"
};

export async function clientLoader({
  request
}: {
  request: Request;
}): Promise<ChatLoaderData | Response> {
  return loadChatData({ request });
}

export async function clientAction({
  request
}: {
  request: Request;
}): Promise<Response | ChatActionData> {
  return submitChatAction({ request });
}

export default function ChatRoute() {
  const loaderData = useLoaderData<ChatLoaderData>();
  const actionData = useActionData<ChatActionData>();
  const navigation = useNavigation();
  const isSubmittingPrompt = navigation.formData?.get("intent") === "sendMessage";
  const effectiveThreadId = actionData?.threadId ?? loaderData.threadId;
  const effectiveMode = actionData?.executionMode ?? loaderData.executionMode;
  const [streamAnswer, setStreamAnswer] = useState("");
  const [streamStatus, setStreamStatus] = useState<"idle" | "ws" | "polling">("idle");
  const lastCursorRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!effectiveThreadId) {
      setStreamStatus("idle");
      setStreamAnswer("");
      lastCursorRef.current = 0;
      return;
    }

    setStreamAnswer("");
    let cancelled = false;
    let ws: WebSocket | null = null;
    const apiClient = createApiClient({
      baseUrl: window.location.origin,
      fetch: globalThis.fetch.bind(globalThis)
    });

    const applyEvent = (event: {
      cursor?: unknown;
      method?: unknown;
      type?: unknown;
      payload?: unknown;
    }) => {
      const cursorCandidate = Number(event.cursor);
      if (Number.isInteger(cursorCandidate) && cursorCandidate > lastCursorRef.current) {
        lastCursorRef.current = cursorCandidate;
      }

      const method = typeof event.method === "string" ? event.method : "";
      const type = typeof event.type === "string" ? event.type : "";
      if (method !== "item.delta" && type !== "item.delta") {
        return;
      }

      const payload = event.payload as { text?: unknown } | undefined;
      const text = typeof payload?.text === "string" ? payload.text : "";
      if (!text) {
        return;
      }

      setStreamAnswer((previous) => previous + text);
    };

    const clearPollTimer = () => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const pollEvents = async () => {
      if (cancelled) {
        return;
      }

      try {
        const result = await apiClient.GET("/v1/agent/threads/{threadId}/events", {
          params: {
            path: {
              threadId: effectiveThreadId
            },
            query: {
              cursor: lastCursorRef.current,
              limit: 200
            }
          },
          credentials: "include"
        });

        const body =
          (result.data as
            | { events?: Array<{ cursor?: unknown; method?: unknown; payload?: unknown }> }
            | undefined) ?? null;
        if (!body) {
          throw new Error("events poll failed");
        }

        for (const event of body.events || []) {
          applyEvent({
            cursor: event.cursor,
            method: event.method,
            type: event.method,
            payload: event.payload
          });
        }
      } catch {
        // retry loop continues
      } finally {
        if (!cancelled) {
          pollTimerRef.current = window.setTimeout(() => {
            void pollEvents();
          }, 1500);
        }
      }
    };

    const startPolling = () => {
      if (cancelled) {
        return;
      }

      setStreamStatus("polling");
      clearPollTimer();
      void pollEvents();
    };

    const wsUrl = new URL(
      `/v1/agent/threads/${encodeURIComponent(effectiveThreadId)}/stream`,
      window.location.origin
    );
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    wsUrl.searchParams.set("cursor", String(lastCursorRef.current));

    try {
      ws = new WebSocket(wsUrl.toString());
      setStreamStatus("ws");

      ws.onmessage = (message) => {
        if (cancelled) {
          return;
        }

        const payload = (() => {
          try {
            return JSON.parse(String(message.data)) as {
              cursor?: unknown;
              method?: unknown;
              type?: unknown;
              payload?: unknown;
            };
          } catch {
            return null;
          }
        })();

        if (!payload) {
          return;
        }

        applyEvent(payload);
      };

      ws.onerror = () => {
        startPolling();
      };

      ws.onclose = () => {
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      clearPollTimer();
      if (ws) {
        ws.close();
      }
    };
  }, [effectiveThreadId]);

  const answerText = actionData?.answer ?? streamAnswer;

  return (
    <section
      className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl flex-col"
      data-testid="chat-page"
    >
      <header className="mb-8 grid gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {loaderData.contextLabel}
        </p>
        <h1 className="text-4xl font-medium tracking-tight">What&apos;s on the agenda today?</h1>
        {effectiveThreadId ? (
          <div className="inline-flex w-fit rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Thread {effectiveThreadId.slice(0, 8)} · {effectiveMode}
          </div>
        ) : null}
      </header>

      <div className="flex-1">
        {actionData?.prompt ? (
          <div className="grid gap-4">
            <article className="ml-auto max-w-[80%] rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-sm">{actionData.prompt}</p>
            </article>
            <article className="max-w-[80%] rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {answerText}
            </article>
          </div>
        ) : (
          <div className="grid place-items-center py-12 text-center text-sm text-muted-foreground">
            <p>
              Start a conversation in your <strong>personal context</strong>
              {effectiveThreadId ? " in this thread." : "."}
            </p>
          </div>
        )}
      </div>

      <Form
        className="mx-auto mt-6 w-full max-w-3xl rounded-3xl border border-border bg-card/90 p-4 shadow-sm"
        method="post"
      >
        <input name="intent" type="hidden" value="sendMessage" />
        <input name="tenantSlug" type="hidden" value={loaderData.tenantSlug ?? ""} />
        <input name="threadId" type="hidden" value={effectiveThreadId ?? ""} />
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="executionMode">
            Execution mode
          </label>
          <select
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
            defaultValue={effectiveMode}
            id="executionMode"
            name="executionMode"
          >
            <option value="cloud">Cloud</option>
            <option value="local">Local</option>
          </select>
          <Input
            autoComplete="off"
            className="h-11 border-0 bg-transparent text-base focus-visible:ring-0"
            name="prompt"
            placeholder="Ask anything"
          />
          <Button className="h-11 px-5" type="submit">
            {isSubmittingPrompt ? "Sending..." : "Send"}
          </Button>
        </div>
        {actionData?.error ? (
          <p className="mt-2 text-sm text-destructive">{actionData.error}</p>
        ) : null}
        {!actionData?.error && effectiveThreadId ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Stream transport: {streamStatus === "polling" ? "polling fallback" : streamStatus}
          </p>
        ) : null}
      </Form>
    </section>
  );
}
