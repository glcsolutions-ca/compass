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

export function readAppendMessagePrompt(message: AppendMessage): string | null {
  const combined = message.content
    .map((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return part.text;
      }
      return "";
    })
    .join("\n")
    .trim();

  return combined.length > 0 ? combined : null;
}
