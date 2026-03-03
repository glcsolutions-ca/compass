import { describe, expect, it } from "vitest";
import type { AppendMessage } from "@assistant-ui/react";
import {
  readAppendMessagePrompt,
  readSubmittingClientRequestId,
  readSubmittingPromptValue,
  resolveReloadPrompt
} from "~/features/chat/hooks/chat-compose-utils";

describe("chat compose utils", () => {
  it("reads and trims submit prompt and request id from form data", () => {
    const formData = new FormData();
    formData.set("prompt", "  hello world  ");
    formData.set("clientRequestId", "  req-1  ");

    expect(readSubmittingPromptValue(formData)).toBe("hello world");
    expect(readSubmittingClientRequestId(formData)).toBe("req-1");
  });

  it("returns null for missing or empty prompt/request id values", () => {
    const formData = new FormData();
    formData.set("prompt", "   ");

    expect(readSubmittingPromptValue(undefined)).toBeNull();
    expect(readSubmittingPromptValue(formData)).toBeNull();
    expect(readSubmittingClientRequestId(formData)).toBeNull();
  });

  it("reads prompt text from assistant message content and attachment names", () => {
    const message = {
      content: [
        { type: "text", text: "Draft response" },
        { type: "reasoning", text: "with context" }
      ],
      attachments: [{ name: "error.log" }, { name: "  " }]
    } as unknown as AppendMessage;

    expect(readAppendMessagePrompt(message)).toBe(
      "Draft response\nwith context\n[Attachment: error.log]"
    );
  });

  it("resolves reload prompt from parent and nearest user messages", () => {
    const messages = [
      { id: "m1", role: "user" as const, text: "First question" },
      { id: "m2", role: "assistant" as const, text: "First response" },
      { id: "m3", role: "user" as const, text: "   " },
      { id: "m4", role: "assistant" as const, text: "Second response" },
      { id: "m5", role: "user" as const, text: "Second question" }
    ];

    expect(resolveReloadPrompt(messages, null)).toBe("Second question");
    expect(resolveReloadPrompt(messages, "m4")).toBe("First question");
    expect(resolveReloadPrompt(messages, "missing")).toBeNull();
    expect(resolveReloadPrompt([], null)).toBeNull();
  });
});
