import { type ComponentType } from "react";
import { ComposerPrimitive } from "@assistant-ui/react";
import { Composer, type ThreadConfig } from "@assistant-ui/react-ui";
import { Mic, MicOff } from "lucide-react";
import type { AgentExecutionMode } from "~/features/chat/agent-types";
import { ChatMarkdownText } from "~/features/chat/presentation/chat-markdown-text";
import type { ChatSurfaceState } from "~/features/chat/presentation/chat-runtime-store";
import { ChatToolFallback } from "~/features/chat/presentation/chat-tool-fallback";
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

function ChatThreadComposer() {
  return (
    <Composer.Root>
      <ComposerPrimitive.Quote className="aui-composer-quote">
        <ComposerPrimitive.QuoteText className="aui-composer-quote-text" />
        <ComposerPrimitive.QuoteDismiss className="aui-composer-quote-dismiss" />
      </ComposerPrimitive.Quote>

      <Composer.Attachments />

      <div className="flex items-end gap-2">
        <Composer.AddAttachment />

        <ComposerPrimitive.If dictation={false}>
          <ComposerPrimitive.Dictate asChild>
            <button className="aui-composer-dictate" type="button">
              <Mic className="h-4 w-4" />
            </button>
          </ComposerPrimitive.Dictate>
        </ComposerPrimitive.If>

        <ComposerPrimitive.If dictation>
          <ComposerPrimitive.StopDictation asChild>
            <button className="aui-composer-dictate" type="button">
              <MicOff className="h-4 w-4" />
            </button>
          </ComposerPrimitive.StopDictation>
        </ComposerPrimitive.If>

        <Composer.Input />
        <Composer.Action aria-label="Send prompt" title="Send prompt" />
      </div>

      <ComposerPrimitive.If dictation>
        <div className="px-2 pb-2 text-xs text-muted-foreground">
          <ComposerPrimitive.DictationTranscript />
        </div>
      </ComposerPrimitive.If>
    </Composer.Root>
  );
}

export function createChatThreadConfig(input: ChatThreadConfigInput): ThreadConfig {
  const MessagesFooter: ComponentType = () => <ChatThreadModeFooter {...input} />;

  return {
    assistantMessage: {
      allowCopy: true,
      allowReload: true,
      allowSpeak: true,
      allowFeedbackNegative: true,
      allowFeedbackPositive: true,
      components: {
        Text: ChatMarkdownText,
        ToolFallback: ChatToolFallback
      }
    },
    branchPicker: {
      allowBranchPicker: true
    },
    composer: {
      allowAttachments: true
    },
    components: {
      Composer: ChatThreadComposer,
      MessagesFooter
    },
    strings: {
      code: {
        header: {
          copy: {
            tooltip: "Copy code snippet"
          }
        }
      },
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
      allowEdit: true
    },
    welcome: {
      message: "What's on the agenda today?",
      suggestions: [
        {
          text: "Summarize recent runtime events",
          prompt: "Summarize the recent runtime events in this thread."
        },
        {
          text: "Draft a release note",
          prompt: "Draft concise release notes for the latest changes."
        },
        {
          text: "Create a debugging plan",
          prompt: "Create a step-by-step debugging plan for a flaky test."
        }
      ]
    }
  };
}
