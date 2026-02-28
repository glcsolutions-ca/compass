import {
  AssistantRuntimeProvider,
  SelectionToolbarPrimitive,
  type AssistantRuntime
} from "@assistant-ui/react";
import { AssistantModal, Thread, type ThreadConfig } from "@assistant-ui/react-ui";
import { useMemo } from "react";
import type { AgentExecutionMode } from "~/features/chat/agent-types";
import { createChatThreadConfig } from "~/features/chat/presentation/chat-thread-config";
import type { ChatSurfaceState } from "~/features/chat/presentation/chat-runtime-store";

interface ChatSurfaceVariantProps {
  runtime: AssistantRuntime;
  executionMode: AgentExecutionMode;
  localModeAvailable: boolean;
  switchingMode: boolean;
  surfaceState: ChatSurfaceState;
  onExecutionModeChange: (nextMode: AgentExecutionMode) => void;
}

function useChatThreadSurfaceConfig(input: ChatSurfaceVariantProps): ThreadConfig {
  return useMemo(
    () =>
      createChatThreadConfig({
        executionMode: input.executionMode,
        localModeAvailable: input.localModeAvailable,
        switchingMode: input.switchingMode,
        surfaceState: input.surfaceState,
        onExecutionModeChange: input.onExecutionModeChange
      }),
    [
      input.executionMode,
      input.localModeAvailable,
      input.onExecutionModeChange,
      input.surfaceState,
      input.switchingMode
    ]
  );
}

function ChatSelectionToolbar() {
  return (
    <SelectionToolbarPrimitive.Root className="aui-selection-toolbar">
      <SelectionToolbarPrimitive.Quote asChild>
        <button className="aui-selection-toolbar-quote" type="button">
          Quote
        </button>
      </SelectionToolbarPrimitive.Quote>
    </SelectionToolbarPrimitive.Root>
  );
}

export function ChatSidebarVariant(input: ChatSurfaceVariantProps) {
  const threadConfig = useChatThreadSurfaceConfig(input);

  return (
    <AssistantRuntimeProvider runtime={input.runtime}>
      <div className="flex h-full min-h-0 w-full gap-4">
        <section className="hidden min-w-0 flex-1 rounded-2xl border border-border/70 bg-card/70 p-5 lg:flex lg:flex-col">
          <h2 className="text-sm font-semibold text-foreground">Sidebar Assistant Surface</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            The thread is mounted in the right rail while runtime and composer behavior remain
            identical to the main chat canvas.
          </p>
        </section>
        <aside className="aui-chat-sidebar-panel">
          <Thread {...threadConfig} />
        </aside>
      </div>
      <ChatSelectionToolbar />
    </AssistantRuntimeProvider>
  );
}

export function ChatModalVariant(input: ChatSurfaceVariantProps) {
  const threadConfig = useChatThreadSurfaceConfig(input);
  const modalThreadConfig = useMemo<ThreadConfig>(
    () => ({
      ...threadConfig,
      strings: {
        ...threadConfig.strings,
        assistantModal: {
          open: {
            button: {
              tooltip: "Close assistant modal"
            }
          },
          closed: {
            button: {
              tooltip: "Open assistant modal"
            }
          }
        }
      }
    }),
    [threadConfig]
  );

  return (
    <AssistantRuntimeProvider runtime={input.runtime}>
      <div className="relative flex h-full min-h-0 w-full flex-col items-start justify-end rounded-2xl border border-border/70 bg-card/70 p-5">
        <h2 className="text-sm font-semibold text-foreground">Assistant Modal Surface</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Use the floating assistant button to open a modal thread that reuses the same runtime
          store and thread configuration as the primary chat surface.
        </p>
        <AssistantModal {...modalThreadConfig} />
      </div>
      <ChatSelectionToolbar />
    </AssistantRuntimeProvider>
  );
}
