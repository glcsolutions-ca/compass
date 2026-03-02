import type {
  AgentEvent,
  ChatTimelineDataPart,
  ChatTimelineMessagePart,
  ChatTimelineReasoningPart,
  ChatTimelineTextPart,
  ChatTimelineToolCallPart
} from "~/features/chat/agent-types";

function readPayloadObject(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value.length > 0 ? value : null;
}

function readTrimmedText(value: unknown): string | null {
  const text = readText(value);
  if (!text) {
    return null;
  }

  const normalized = text.trim();
  return normalized.length > 0 ? normalized : null;
}

function combineStreamingText(existing: string, incoming: string): string {
  if (existing.length === 0) {
    return incoming;
  }

  if (incoming.length === 0) {
    return existing;
  }

  if (incoming.startsWith(existing)) {
    return incoming;
  }

  if (existing.endsWith(incoming)) {
    return existing;
  }

  return `${existing}${incoming}`;
}

function parseArgsObject(candidate: unknown): Record<string, unknown> {
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }

  if (typeof candidate === "string") {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function readContentText(content: unknown): string | null {
  if (typeof content === "string") {
    return content.length > 0 ? content : null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .map((segment) => {
      if (!segment || typeof segment !== "object") {
        return "";
      }

      const textValue = readText((segment as { text?: unknown }).text);
      return textValue ?? "";
    })
    .join("");

  return text.length > 0 ? text : null;
}

function readReasoningText(value: unknown): string | null {
  if (typeof value === "string") {
    return value.length > 0 ? value : null;
  }

  const objectValue = readPayloadObject(value);
  if (!objectValue) {
    return null;
  }

  return (
    readText(objectValue.text) ??
    readContentText(objectValue.content) ??
    readContentText(objectValue.summary)
  );
}

function maybeParseToolCallPart(
  payload: unknown,
  fallbackToolCallId: string
): ChatTimelineToolCallPart | null {
  const data = readPayloadObject(payload);
  if (!data) {
    return null;
  }

  const typeName = readTrimmedText(data.type)?.toLowerCase();
  const functionPayload = readPayloadObject(data.function);
  const id = readTrimmedText(data.toolCallId) ?? readTrimmedText(data.callId) ?? fallbackToolCallId;
  const toolName =
    readTrimmedText(data.toolName) ??
    readTrimmedText(data.name) ??
    readTrimmedText(data.tool) ??
    readTrimmedText(functionPayload?.name) ??
    (typeName?.includes("tool") ? "tool" : null);

  if (!toolName) {
    return null;
  }

  const argsSource = data.args ?? data.input ?? functionPayload?.arguments ?? data.argsText;
  const args = parseArgsObject(argsSource);
  const argsTextFromPayload =
    readText(data.argsText) ??
    readText(data.args) ??
    readText(functionPayload?.arguments) ??
    readText(data.input);
  const argsText =
    argsTextFromPayload ?? (Object.keys(args).length > 0 ? JSON.stringify(args, null, 2) : "{}");
  const status = readTrimmedText(data.status)?.toLowerCase();
  const result = data.result ?? data.output ?? data.response;
  const error = data.error;

  return {
    type: "tool-call",
    toolCallId: id,
    toolName,
    argsText,
    args,
    result: result ?? error,
    isError: Boolean(data.isError) || Boolean(error) || status === "error" || status === "failed",
    parentId: readTrimmedText(data.parentId) ?? undefined
  };
}

function parseContentSegment(
  segment: unknown,
  fallbackToolCallId: string
): ChatTimelineMessagePart[] {
  if (typeof segment === "string") {
    return [
      {
        type: "text",
        text: segment
      }
    ];
  }

  if (!segment || typeof segment !== "object") {
    return [];
  }

  const data = segment as Record<string, unknown>;
  const typeName = readTrimmedText(data.type)?.toLowerCase();

  if (typeName?.includes("tool")) {
    const toolPart = maybeParseToolCallPart(data, fallbackToolCallId);
    return toolPart ? [toolPart] : [];
  }

  if (typeName?.includes("reason")) {
    const reasoningText =
      readReasoningText(data.text) ??
      readReasoningText(data.reasoning) ??
      readContentText(data.content);
    return reasoningText
      ? [
          {
            type: "reasoning",
            text: reasoningText
          }
        ]
      : [];
  }

  const toolPart = maybeParseToolCallPart(data, fallbackToolCallId);
  if (toolPart) {
    return [toolPart];
  }

  const text = readText(data.text) ?? readText(data.delta) ?? readContentText(data.content);
  if (text) {
    return [
      {
        type: "text",
        text,
        parentId: readTrimmedText(data.parentId) ?? undefined
      }
    ];
  }

  return [];
}

function upsertToolCallPart(
  existing: ChatTimelineToolCallPart,
  incoming: ChatTimelineToolCallPart
): ChatTimelineToolCallPart {
  return {
    ...existing,
    ...incoming,
    toolName: incoming.toolName || existing.toolName,
    args: Object.keys(incoming.args).length > 0 ? incoming.args : existing.args,
    argsText: combineStreamingText(existing.argsText, incoming.argsText),
    result: incoming.result ?? existing.result,
    isError: incoming.isError ?? existing.isError
  };
}

export function mergeTimelineMessageParts(
  existingParts: readonly ChatTimelineMessagePart[],
  incomingParts: readonly ChatTimelineMessagePart[]
): ChatTimelineMessagePart[] {
  const merged = [...existingParts];

  for (const incomingPart of incomingParts) {
    if (incomingPart.type === "text" || incomingPart.type === "reasoning") {
      const lastIndex = merged.length - 1;
      const lastPart = merged[lastIndex];
      if (lastPart && lastPart.type === incomingPart.type) {
        const combinedText = combineStreamingText(lastPart.text, incomingPart.text);
        merged[lastIndex] = {
          ...lastPart,
          text: combinedText
        } as ChatTimelineTextPart | ChatTimelineReasoningPart;
      } else {
        merged.push(incomingPart);
      }
      continue;
    }

    if (incomingPart.type === "tool-call") {
      const existingIndex = merged.findIndex(
        (part) => part.type === "tool-call" && part.toolCallId === incomingPart.toolCallId
      );
      if (existingIndex >= 0) {
        const existing = merged[existingIndex];
        if (existing && existing.type === "tool-call") {
          merged[existingIndex] = upsertToolCallPart(existing, incomingPart);
          continue;
        }
      }

      merged.push(incomingPart);
      continue;
    }

    merged.push(incomingPart);
  }

  return merged;
}

export function readTimelineMessageText(parts: readonly ChatTimelineMessagePart[]): string {
  return parts
    .filter(
      (part): part is ChatTimelineTextPart | ChatTimelineReasoningPart =>
        part.type === "text" || part.type === "reasoning"
    )
    .map((part) => part.text)
    .join("");
}

export function parseItemDeltaParts(input: {
  cursor: number;
  payload: unknown;
}): ChatTimelineMessagePart[] {
  const data = readPayloadObject(input.payload);
  if (!data) {
    return [];
  }

  const parts: ChatTimelineMessagePart[] = [];
  const content = data.content;
  if (Array.isArray(content)) {
    content.forEach((segment, index) => {
      parts.push(
        ...parseContentSegment(segment, `tool-${input.cursor.toString()}-${index.toString()}`)
      );
    });
  }

  if (parts.length < 1) {
    const toolPart = maybeParseToolCallPart(data, `tool-${input.cursor.toString()}`);
    if (toolPart) {
      parts.push(toolPart);
    }

    const typeName = readTrimmedText(data.type)?.toLowerCase();
    const reasoningFromType = typeName?.includes("reason") ? readReasoningText(data.text) : null;
    const reasoningText =
      reasoningFromType ??
      readReasoningText(data.reasoning) ??
      readReasoningText(data.thought) ??
      readReasoningText(data.summary);
    if (reasoningText) {
      parts.push({
        type: "reasoning",
        text: reasoningText
      });
    }

    const text = readText(data.text) ?? readText(data.delta) ?? readContentText(data.content);
    if (text && !(typeName?.includes("reason") && reasoningFromType)) {
      parts.push({
        type: "text",
        text
      });
    }
  }

  return parts;
}

export function parseRuntimeDataPart(input: {
  method: string;
  payload: unknown;
}): ChatTimelineDataPart | null {
  if (input.method === "runtime.metadata" || input.method.startsWith("runtime.")) {
    return {
      type: "data",
      name: input.method,
      data: input.payload
    };
  }

  return null;
}

export function eventRendersInline(
  event: Pick<AgentEvent, "cursor" | "method" | "payload">
): boolean {
  if (event.method === "runtime.metadata" || event.method.startsWith("runtime.")) {
    return true;
  }

  if (event.method === "item.delta") {
    return (
      parseItemDeltaParts({
        cursor: event.cursor,
        payload: event.payload
      }).length > 0
    );
  }

  return false;
}
