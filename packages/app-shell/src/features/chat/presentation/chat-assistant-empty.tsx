import type { EmptyMessagePartProps } from "@assistant-ui/react";
import { LoaderCircle } from "lucide-react";

export function ChatAssistantEmpty({ status }: EmptyMessagePartProps) {
  if (status.type !== "running") {
    return null;
  }

  return (
    <div className="aui-chat-assistant-empty" role="status">
      <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
      <span>Working through that…</span>
    </div>
  );
}
