import type { AppendMessage } from "@assistant-ui/react";

export function readSubmittingPromptValue(formData: FormData | undefined): string | null {
  if (!formData) {
    return null;
  }

  const prompt = formData.get("prompt");
  if (typeof prompt !== "string") {
    return null;
  }

  const normalized = prompt.trim();
  return normalized.length > 0 ? normalized : null;
}

export function readSubmittingClientRequestId(formData: FormData | undefined): string | null {
  if (!formData) {
    return null;
  }

  const clientRequestId = formData.get("clientRequestId");
  if (typeof clientRequestId !== "string") {
    return null;
  }

  const normalized = clientRequestId.trim();
  return normalized.length > 0 ? normalized : null;
}

function readAttachmentPromptLines(message: AppendMessage): string[] {
  const attachments = message.attachments ?? [];
  return attachments
    .map((attachment) => {
      const name = attachment.name?.trim();
      if (!name) {
        return null;
      }

      return `[Attachment: ${name}]`;
    })
    .filter((value): value is string => value !== null);
}

export function readAppendMessagePrompt(message: AppendMessage): string | null {
  const textPrompt = message.content
    .map((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return part.text;
      }
      return "";
    })
    .join("\n")
    .trim();

  const attachmentLines = readAttachmentPromptLines(message);
  const combined = [textPrompt, ...attachmentLines].filter(Boolean).join("\n").trim();

  return combined.length > 0 ? combined : null;
}

interface ReloadPromptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function resolveReloadPrompt(
  messages: readonly ReloadPromptMessage[],
  parentId: string | null
): string | null {
  if (messages.length < 1) {
    return null;
  }

  const parentIndex =
    parentId === null
      ? messages.length - 1
      : messages.findIndex((message) => message.id === parentId);

  if (parentIndex < 0) {
    return null;
  }

  for (let index = parentIndex; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate?.role !== "user") {
      continue;
    }

    const prompt = candidate.text.trim();
    if (prompt.length > 0) {
      return prompt;
    }
  }

  return null;
}
