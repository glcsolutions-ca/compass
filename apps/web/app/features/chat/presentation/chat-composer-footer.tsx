import type { AgentExecutionMode } from "~/features/chat/agent-types";
import type { ChatSurfaceState } from "~/features/chat/presentation/chat-runtime-store";

interface ChatComposerFooterProps {
  executionMode: AgentExecutionMode;
  localModeAvailable: boolean;
  switchingMode: boolean;
  surfaceState: ChatSurfaceState;
  onExecutionModeChange: (nextMode: AgentExecutionMode) => void;
}

/**
 * Kept for frontend constitution path compatibility.
 * Composer rendering is now provided by assistant-ui react-ui defaults.
 */
export function ChatComposerFooter(_props: ChatComposerFooterProps) {
  return null;
}
