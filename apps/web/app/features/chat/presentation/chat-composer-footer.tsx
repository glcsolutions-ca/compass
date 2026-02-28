import { ComposerPrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { CircleStop, SendHorizontal } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { AgentExecutionMode } from "~/features/chat/agent-types";
import type { ChatSurfaceState } from "~/features/chat/presentation/chat-runtime-store";
import { cn } from "~/lib/utils/cn";

interface ChatComposerFooterProps {
  executionMode: AgentExecutionMode;
  localModeAvailable: boolean;
  switchingMode: boolean;
  surfaceState: ChatSurfaceState;
  onExecutionModeChange: (nextMode: AgentExecutionMode) => void;
}

export function ChatComposerFooter({
  executionMode,
  localModeAvailable,
  switchingMode,
  surfaceState,
  onExecutionModeChange
}: ChatComposerFooterProps) {
  const hasSurfaceError = Boolean(surfaceState.actionError || surfaceState.transportError);
  const statusText =
    surfaceState.actionError || surfaceState.transportError || surfaceState.transportLabel;

  return (
    <ComposerPrimitive.Root className="aui-composer-root border-border bg-background/95">
      <ComposerPrimitive.Input
        className="aui-composer-input min-h-[68px] px-3 pt-3"
        placeholder="Ask Compass anything..."
        rows={2}
      />

      <div className="flex w-full items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            htmlFor="chat-composer-mode"
          >
            Mode
          </label>
          <select
            className="h-7 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
            disabled={switchingMode}
            id="chat-composer-mode"
            onChange={(event) =>
              onExecutionModeChange(event.target.value === "local" ? "local" : "cloud")
            }
            value={executionMode}
          >
            <option value="cloud">Cloud</option>
            <option disabled={!localModeAvailable} value="local">
              Local{localModeAvailable ? "" : " (coming soon)"}
            </option>
          </select>
          <span
            className={cn(
              "truncate text-[11px] text-muted-foreground",
              hasSurfaceError && "text-destructive"
            )}
            role={hasSurfaceError ? "alert" : "status"}
          >
            {statusText}
          </span>
        </div>

        <ThreadPrimitive.If running={false}>
          <ComposerPrimitive.Send asChild>
            <Button
              aria-label="Send prompt"
              className="h-8 w-8 rounded-full p-0"
              size="icon"
              type="button"
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </ComposerPrimitive.Send>
        </ThreadPrimitive.If>

        <ThreadPrimitive.If running>
          <ComposerPrimitive.Cancel asChild>
            <Button
              aria-label="Interrupt active turn"
              className="h-8 w-8 rounded-full p-0"
              size="icon"
              type="button"
              variant="outline"
            >
              <CircleStop className="h-4 w-4" />
            </Button>
          </ComposerPrimitive.Cancel>
        </ThreadPrimitive.If>
      </div>
    </ComposerPrimitive.Root>
  );
}
