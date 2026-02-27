import { AssistantRuntimeProvider, type AssistantRuntime } from "@assistant-ui/react";
import { Thread } from "@assistant-ui/react-ui";
import { createContext, useContext, useMemo } from "react";
import type { AgentExecutionMode } from "~/features/chat/agent-types";
import { ChatComposerFooter } from "~/features/chat/presentation/chat-composer-footer";
import { type ChatSurfaceState } from "~/features/chat/presentation/chat-runtime-store";

interface ChatCanvasProps {
  runtime: AssistantRuntime;
  executionMode: AgentExecutionMode;
  localModeAvailable: boolean;
  switchingMode: boolean;
  surfaceState: ChatSurfaceState;
  onExecutionModeChange: (nextMode: AgentExecutionMode) => void;
}

interface ChatCanvasContextValue {
  executionMode: AgentExecutionMode;
  localModeAvailable: boolean;
  switchingMode: boolean;
  surfaceState: ChatSurfaceState;
  onExecutionModeChange: (nextMode: AgentExecutionMode) => void;
}

const ChatCanvasContext = createContext<ChatCanvasContextValue | null>(null);

function useChatCanvasContext(): ChatCanvasContextValue {
  const value = useContext(ChatCanvasContext);
  if (!value) {
    throw new Error("ChatCanvasContext is not available");
  }

  return value;
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

export function ChatCanvas({
  runtime,
  executionMode,
  localModeAvailable,
  switchingMode,
  surfaceState,
  onExecutionModeChange
}: ChatCanvasProps) {
  const contextValue = useMemo(
    () => ({
      executionMode,
      localModeAvailable,
      switchingMode,
      surfaceState,
      onExecutionModeChange
    }),
    [executionMode, localModeAvailable, onExecutionModeChange, surfaceState, switchingMode]
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
              allowFeedbackPositive: false
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
