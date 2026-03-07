import { ComposerPrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { CircleStop, LoaderCircle, SendHorizontal } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { ChatSurfaceState } from "~/features/chat/presentation/chat-runtime-store";
import { cn } from "~/lib/utils/cn";

interface ChatThreadComposerProps {
  surfaceState: ChatSurfaceState;
  isBusy: boolean;
  canCancel: boolean;
}

export function ChatThreadComposer({
  surfaceState,
  isBusy,
  canCancel
}: ChatThreadComposerProps) {
  const statusText =
    surfaceState.actionError ||
    surfaceState.transportError ||
    surfaceState.activityLabel ||
    surfaceState.transportLabel;
  const hasSurfaceError = Boolean(surfaceState.actionError || surfaceState.transportError);

  return (
    <ComposerPrimitive.Root className="aui-composer-root border-border bg-background/95">
      <ComposerPrimitive.Input
        className="aui-composer-input min-h-[72px] px-4 pt-4"
        placeholder="Ask Compass anything..."
        rows={2}
      />

      <div className="flex w-full items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="aui-chat-composer-mode">{surfaceState.executionLabel}</span>

          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500/80",
                surfaceState.isPending && "animate-pulse bg-amber-500",
                hasSurfaceError && "bg-destructive"
              )}
            />
            <span
              className={cn(
                "truncate text-xs text-muted-foreground",
                hasSurfaceError && "text-destructive"
              )}
              role={hasSurfaceError ? "alert" : "status"}
            >
              {statusText}
            </span>
          </div>
        </div>

        {isBusy && !canCancel ? (
          <Button
            aria-label="Submitting prompt"
            className="h-9 w-9 rounded-full p-0"
            disabled
            size="icon"
            type="button"
            variant="outline"
          >
            <LoaderCircle className="h-4 w-4 animate-spin" />
          </Button>
        ) : null}

        {!isBusy ? (
          <ComposerPrimitive.Send asChild>
            <Button
              aria-label="Send prompt"
              className="h-9 w-9 rounded-full p-0 shadow-sm"
              size="icon"
              type="button"
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </ComposerPrimitive.Send>
        ) : null}

        {canCancel ? (
          <ThreadPrimitive.If running>
            <ComposerPrimitive.Cancel asChild>
              <Button
                aria-label="Interrupt active turn"
                className="h-9 w-9 rounded-full p-0"
                size="icon"
                type="button"
                variant="outline"
              >
                <CircleStop className="h-4 w-4" />
              </Button>
            </ComposerPrimitive.Cancel>
          </ThreadPrimitive.If>
        ) : null}
      </div>
    </ComposerPrimitive.Root>
  );
}
