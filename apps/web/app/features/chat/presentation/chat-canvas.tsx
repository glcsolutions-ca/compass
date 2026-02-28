import {
  AssistantRuntimeProvider,
  SelectionToolbarPrimitive,
  type AssistantRuntime
} from "@assistant-ui/react";
import { Thread } from "@assistant-ui/react-ui";
import { useMemo } from "react";
import type { AgentExecutionMode } from "~/features/chat/agent-types";
import { createChatThreadConfig } from "~/features/chat/presentation/chat-thread-config";
import { type ChatSurfaceState } from "~/features/chat/presentation/chat-runtime-store";

interface ChatCanvasProps {
  runtime: AssistantRuntime;
  executionMode: AgentExecutionMode;
  localModeAvailable: boolean;
  switchingMode: boolean;
  surfaceState: ChatSurfaceState;
  onExecutionModeChange: (nextMode: AgentExecutionMode) => void;
}

export function ChatCanvas({
  runtime,
  executionMode,
  localModeAvailable,
  switchingMode,
  surfaceState,
  onExecutionModeChange
}: ChatCanvasProps) {
  const threadConfig = useMemo(
    () =>
      createChatThreadConfig({
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
      <div className="flex h-full min-h-0 w-full" data-testid="chat-canvas-root">
        <Thread {...threadConfig} />
        <SelectionToolbarPrimitive.Root className="aui-selection-toolbar">
          <SelectionToolbarPrimitive.Quote asChild>
            <button className="aui-selection-toolbar-quote" type="button">
              Quote
            </button>
          </SelectionToolbarPrimitive.Quote>
        </SelectionToolbarPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}
