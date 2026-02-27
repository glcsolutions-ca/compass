import type { TextMessagePartProps } from "@assistant-ui/react";
import { AssistantRuntimeProvider, type AssistantRuntime, useMessage } from "@assistant-ui/react";
import { MessagePart, Thread } from "@assistant-ui/react-ui";
import { createContext, useContext, useMemo } from "react";
import type { AgentExecutionMode } from "~/features/chat/agent-types";
import { ChatComposerFooter } from "~/features/chat/presentation/chat-composer-footer";
import {
  type AssistantEventPartModel,
  type ChatSurfaceState,
  type ChatInspectTab,
  readAssistantEventPartFromMetadata
} from "~/features/chat/presentation/chat-runtime-store";
import { cn } from "~/lib/utils/cn";

interface ChatCanvasProps {
  runtime: AssistantRuntime;
  executionMode: AgentExecutionMode;
  localModeAvailable: boolean;
  switchingMode: boolean;
  surfaceState: ChatSurfaceState;
  onExecutionModeChange: (nextMode: AgentExecutionMode) => void;
  onInspectEvent: (cursor: number, tab: ChatInspectTab) => void;
}

interface ChatCanvasContextValue {
  executionMode: AgentExecutionMode;
  localModeAvailable: boolean;
  switchingMode: boolean;
  surfaceState: ChatSurfaceState;
  onExecutionModeChange: (nextMode: AgentExecutionMode) => void;
  onInspectEvent: (cursor: number, tab: ChatInspectTab) => void;
}

const ChatCanvasContext = createContext<ChatCanvasContextValue | null>(null);

function useChatCanvasContext(): ChatCanvasContextValue {
  const value = useContext(ChatCanvasContext);
  if (!value) {
    throw new Error("ChatCanvasContext is not available");
  }

  return value;
}

function EventCard({
  eventPart,
  onInspectEvent
}: {
  eventPart: AssistantEventPartModel;
  onInspectEvent: (cursor: number, tab: ChatInspectTab) => void;
}) {
  const canInspect = typeof eventPart.cursor === "number";
  const toneClassName =
    eventPart.kind === "approval"
      ? "text-amber-700 dark:text-amber-300"
      : eventPart.kind === "runtime"
        ? "text-sky-700 dark:text-sky-300"
        : "text-muted-foreground";

  return (
    <button
      className={cn(
        "w-full rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-left transition-colors",
        canInspect ? "hover:bg-accent/70" : "cursor-default"
      )}
      disabled={!canInspect}
      onClick={() => {
        if (!canInspect || eventPart.cursor === null) {
          return;
        }

        onInspectEvent(eventPart.cursor, eventPart.defaultTab);
      }}
      type="button"
    >
      <p className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", toneClassName)}>
        {eventPart.kind}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{eventPart.label}</p>
      {eventPart.detail ? (
        <p className="mt-1 text-xs text-muted-foreground">{eventPart.detail}</p>
      ) : null}
      {canInspect ? <p className="mt-1 text-[11px] text-muted-foreground">Open details</p> : null}
    </button>
  );
}

function ChatCanvasComposer() {
  const context = useChatCanvasContext();

  return (
    <ChatComposerFooter
      executionMode={context.executionMode}
      localModeAvailable={context.localModeAvailable}
      onExecutionModeChange={context.onExecutionModeChange}
      surfaceState={context.surfaceState}
      switchingMode={context.switchingMode}
    />
  );
}

function ChatCanvasEventTextPart(_part: TextMessagePartProps) {
  const context = useChatCanvasContext();
  const eventPart = useMessage((state) => readAssistantEventPartFromMetadata(state.metadata));
  if (!eventPart) {
    return <MessagePart.Text />;
  }

  return <EventCard eventPart={eventPart} onInspectEvent={context.onInspectEvent} />;
}

export function ChatCanvas({
  runtime,
  executionMode,
  localModeAvailable,
  switchingMode,
  surfaceState,
  onExecutionModeChange,
  onInspectEvent
}: ChatCanvasProps) {
  const contextValue = useMemo(
    () => ({
      executionMode,
      localModeAvailable,
      switchingMode,
      surfaceState,
      onExecutionModeChange,
      onInspectEvent
    }),
    [
      executionMode,
      localModeAvailable,
      onExecutionModeChange,
      onInspectEvent,
      surfaceState,
      switchingMode
    ]
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatCanvasContext.Provider value={contextValue}>
        <div className="flex h-full min-h-0 w-full" data-testid="chat-canvas-root">
          <Thread
            assistantMessage={{
              allowReload: false,
              allowSpeak: false,
              allowFeedbackNegative: false,
              allowFeedbackPositive: false,
              components: {
                Text: ChatCanvasEventTextPart
              }
            }}
            branchPicker={{
              allowBranchPicker: false
            }}
            components={{
              Composer: ChatCanvasComposer
            }}
            strings={{
              composer: {
                cancel: {
                  tooltip: "Interrupt active turn"
                },
                send: {
                  tooltip: "Send prompt"
                }
              },
              thread: {
                scrollToBottom: {
                  tooltip: "Jump to newest message"
                }
              }
            }}
            userMessage={{
              allowEdit: false
            }}
            welcome={{
              message: "What's on the agenda today?"
            }}
          />
        </div>
      </ChatCanvasContext.Provider>
    </AssistantRuntimeProvider>
  );
}
