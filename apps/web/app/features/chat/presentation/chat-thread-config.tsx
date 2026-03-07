import { type ThreadConfig } from "@assistant-ui/react-ui";
import { ChatAssistantEmpty } from "~/features/chat/presentation/chat-assistant-empty";
import { ChatThreadComposer } from "~/features/chat/presentation/chat-thread-composer";
import { ChatMarkdownText } from "~/features/chat/presentation/chat-markdown-text";
import { ChatToolFallback } from "~/features/chat/presentation/chat-tool-fallback";
import type { ChatSurfaceState } from "~/features/chat/presentation/chat-runtime-store";

interface CreateChatThreadConfigInput {
  surfaceState: ChatSurfaceState;
  isBusy: boolean;
  canCancel: boolean;
}

export function createChatThreadConfig(input: CreateChatThreadConfigInput): ThreadConfig {
  return {
    assistantMessage: {
      allowCopy: true,
      allowReload: true,
      allowSpeak: true,
      allowFeedbackNegative: true,
      allowFeedbackPositive: true,
      components: {
        Empty: ChatAssistantEmpty,
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
      Composer: () => (
        <ChatThreadComposer
          canCancel={input.canCancel}
          isBusy={input.isBusy}
          surfaceState={input.surfaceState}
        />
      )
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
      message: "What do you want to work through?",
      suggestions: [
        {
          text: "Summarize recent runtime events",
          prompt: "Summarize the recent runtime events in this thread."
        },
        {
          text: "Draft release notes",
          prompt: "Draft concise release notes for the latest changes."
        },
        {
          text: "Plan a debugging session",
          prompt: "Create a step-by-step debugging plan for a flaky test."
        }
      ]
    }
  };
}
