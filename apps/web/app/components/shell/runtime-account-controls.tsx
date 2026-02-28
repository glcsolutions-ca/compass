import { useMemo, useState } from "react";
import { AlertCircle, KeyRound, Link2, Loader2, LogOut, RefreshCw, Shield } from "lucide-react";
import type { RuntimeRateLimitSnapshot } from "@compass/contracts";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useRuntimeAccount } from "~/components/shell/use-runtime-account";
import { cn } from "~/lib/utils/cn";

function resolveConnectedLabel(state: ReturnType<typeof useRuntimeAccount>["state"]): string {
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
  const runtimeAccount = useRuntimeAccount();
  const [apiKey, setApiKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [chatgptAccountId, setChatgptAccountId] = useState("");
  const [chatgptPlanType, setChatgptPlanType] = useState("");

  const providerManaged = runtimeAccount.state?.provider === "dynamic_sessions";
  const interactiveAuthEnabled = runtimeAccount.state?.capabilities.interactiveAuth === true;
  const canUseApiKey = runtimeAccount.state?.capabilities.supportsApiKey === true;
  const canUseChatgpt = runtimeAccount.state?.capabilities.supportsChatgptManaged === true;
  const canUseExternalTokens =
    runtimeAccount.state?.capabilities.supportsChatgptAuthTokens === true;

  const connected =
    Boolean(runtimeAccount.state?.authMode) ||
    (!runtimeAccount.state?.requiresOpenaiAuth && !!runtimeAccount.state);
  const connectedLabel = resolveConnectedLabel(runtimeAccount.state);

  const rateLimitEntries = useMemo(() => {
    if (!runtimeAccount.rateLimits) {
      return [];
    }

    if (runtimeAccount.rateLimits.rateLimitsByLimitId) {
      return Object.entries(runtimeAccount.rateLimits.rateLimitsByLimitId)
        .filter(([, snapshot]) => Boolean(snapshot))
        .map(([key, snapshot]) => [key, snapshot as RuntimeRateLimitSnapshot] as const);
    }

    if (runtimeAccount.rateLimits.rateLimits) {
      const key = runtimeAccount.rateLimits.rateLimits.limitId || "primary";
      return [[key, runtimeAccount.rateLimits.rateLimits] as const];
    }

    return [];
  }, [runtimeAccount.rateLimits]);

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
            {runtimeAccount.loading ? "Checking runtime state..." : connectedLabel}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Provider: {runtimeAccount.state?.provider ?? "unknown"}
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

      {runtimeAccount.pendingLoginId ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>ChatGPT login is in progress.</span>
          <Button
            disabled={runtimeAccount.busy}
            onClick={() => {
              void runtimeAccount.cancelLogin();
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {runtimeAccount.errorMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{runtimeAccount.errorMessage}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            runtimeAccount.busy ||
            runtimeAccount.loading ||
            !interactiveAuthEnabled ||
            !canUseChatgpt
          }
          onClick={() => {
            void runtimeAccount.startChatgptLogin();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Link2 className="mr-1.5 h-4 w-4" />
          Connect ChatGPT
        </Button>

        <Button
          disabled={runtimeAccount.busy || runtimeAccount.loading || !connected}
          onClick={() => {
            void runtimeAccount.disconnect();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <LogOut className="mr-1.5 h-4 w-4" />
          Disconnect
        </Button>

        <Button
          disabled={runtimeAccount.busy}
          onClick={() => {
            void runtimeAccount.refreshState();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {runtimeAccount.busy ? (
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
              runtimeAccount.clearError();
            }}
            placeholder="sk-..."
            type="password"
            value={apiKey}
          />
          <Button
            className="sm:w-auto"
            disabled={
              runtimeAccount.busy ||
              runtimeAccount.loading ||
              !interactiveAuthEnabled ||
              !canUseApiKey
            }
            onClick={() => {
              void runtimeAccount.startApiKeyLogin(apiKey);
              setApiKey("");
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
              runtimeAccount.clearError();
            }}
            placeholder="Access token"
            type="password"
            value={accessToken}
          />
          <Input
            autoComplete="off"
            onChange={(event) => {
              setChatgptAccountId(event.target.value);
              runtimeAccount.clearError();
            }}
            placeholder="ChatGPT account id"
            value={chatgptAccountId}
          />
          <Input
            autoComplete="off"
            onChange={(event) => {
              setChatgptPlanType(event.target.value);
              runtimeAccount.clearError();
            }}
            placeholder="Plan type (optional)"
            value={chatgptPlanType}
          />
          <Button
            disabled={runtimeAccount.busy || runtimeAccount.loading || !interactiveAuthEnabled}
            onClick={() => {
              void runtimeAccount.startExternalTokenLogin({
                accessToken,
                chatgptAccountId,
                chatgptPlanType
              });
              setAccessToken("");
              setChatgptAccountId("");
              setChatgptPlanType("");
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
