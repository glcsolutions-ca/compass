import { type ThreadConfig } from "@assistant-ui/react-ui";
import { ChatMarkdownText } from "~/features/chat/presentation/chat-markdown-text";
import { ChatToolFallback } from "~/features/chat/presentation/chat-tool-fallback";

export function createChatThreadConfig(): ThreadConfig {
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
