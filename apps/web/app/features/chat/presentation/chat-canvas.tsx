import { AssistantRuntimeProvider, type AssistantRuntime } from "@assistant-ui/react";
import { Thread } from "@assistant-ui/react-ui";
import { useMemo } from "react";
import { createChatThreadConfig } from "~/features/chat/presentation/chat-thread-config";

interface ChatCanvasProps {
  runtime: AssistantRuntime;
}

export function ChatCanvas({ runtime }: ChatCanvasProps) {
  const threadConfig = useMemo(() => createChatThreadConfig(), []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full min-h-0 w-full" data-testid="chat-canvas-root">
        <Thread {...threadConfig} />
      </div>
    </AssistantRuntimeProvider>
  );
}
