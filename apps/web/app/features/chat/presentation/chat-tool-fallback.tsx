import type { ToolCallMessagePartProps } from "@assistant-ui/react";

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readToolStatusLabel(status: ToolCallMessagePartProps["status"]): string {
  if (status.type === "running") {
    return "Running";
  }

  if (status.type === "requires-action") {
    return "Awaiting input";
  }

  if (status.type === "complete") {
    return "Complete";
  }

  if (status.type === "incomplete") {
    return "Incomplete";
  }

  return "Ready";
}

export function ChatToolFallback(part: ToolCallMessagePartProps) {
  const resultText = part.result === undefined ? null : stringifyJson(part.result);
  const statusLabel = readToolStatusLabel(part.status);
  const hasError = part.isError === true || part.status.type === "incomplete";

  return (
    <section className="aui-chat-tool-fallback" data-status={part.status.type}>
      <div className="aui-chat-tool-fallback-header">
        <span className="aui-chat-tool-fallback-label">Tool</span>
        <code className="aui-chat-tool-fallback-name">{part.toolName}</code>
        <span className="aui-chat-tool-fallback-status">{statusLabel}</span>
      </div>

      <details className="aui-chat-tool-fallback-details" open>
        <summary>Arguments</summary>
        <pre>{part.argsText}</pre>
      </details>

      {resultText ? (
        <details className="aui-chat-tool-fallback-details" open={part.status.type !== "running"}>
          <summary>Result</summary>
          <pre>{resultText}</pre>
        </details>
      ) : null}

      {hasError ? (
        <p className="aui-chat-tool-fallback-error">
          The tool returned an incomplete or error state.
        </p>
      ) : null}
    </section>
  );
}
