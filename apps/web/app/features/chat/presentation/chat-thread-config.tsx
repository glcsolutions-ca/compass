import { type ComponentType } from "react";
import { type ThreadConfig } from "@assistant-ui/react-ui";
import type { AgentExecutionMode } from "~/features/chat/agent-types";
import type { ChatSurfaceState } from "~/features/chat/presentation/chat-runtime-store";
import { cn } from "~/lib/utils/cn";

export interface ChatThreadConfigInput {
  executionMode: AgentExecutionMode;
  localModeAvailable: boolean;
  switchingMode: boolean;
  surfaceState: ChatSurfaceState;
  onExecutionModeChange: (nextMode: AgentExecutionMode) => void;
}

function ChatThreadModeFooter(props: ChatThreadConfigInput) {
  const hasSurfaceError = Boolean(
    props.surfaceState.actionError || props.surfaceState.transportError
  );
  const statusText =
    props.surfaceState.actionError ||
    props.surfaceState.transportError ||
    props.surfaceState.transportLabel;

  return (
    <div className="mx-auto mt-2 flex w-full max-w-[var(--aui-thread-max-width)] items-center justify-between gap-3 px-1 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <label
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          htmlFor="chat-thread-mode"
        >
          Mode
        </label>
        <select
          className="h-7 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
          disabled={props.switchingMode}
          id="chat-thread-mode"
          onChange={(event) =>
            props.onExecutionModeChange(event.target.value === "local" ? "local" : "cloud")
          }
          value={props.executionMode}
        >
          <option value="cloud">Cloud</option>
          <option disabled={!props.localModeAvailable} value="local">
            Local{props.localModeAvailable ? "" : " (desktop only)"}
          </option>
        </select>
      </div>

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
  );
}

export function createChatThreadConfig(input: ChatThreadConfigInput): ThreadConfig {
  const MessagesFooter: ComponentType = () => <ChatThreadModeFooter {...input} />;

  return {
    assistantMessage: {
      allowCopy: false,
      allowReload: false,
      allowSpeak: false,
      allowFeedbackNegative: false,
      allowFeedbackPositive: false
    },
    branchPicker: {
      allowBranchPicker: false
    },
    composer: {
      allowAttachments: false
    },
    components: {
      MessagesFooter
    },
    strings: {
      composer: {
        cancel: {
          tooltip: "Interrupt active turn"
        },
        send: {
          tooltip: "Send prompt"
        },
        input: {
          placeholder: "Ask Compass anything..."
        }
      },
      thread: {
        scrollToBottom: {
          tooltip: "Jump to newest message"
        }
      }
    },
    userMessage: {
      allowEdit: false
    },
    welcome: {
      message: "What's on the agenda today?"
    }
  };
}
