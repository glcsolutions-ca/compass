import { describe, expect, it } from "vitest";
import { clientAction as chatAction } from "~/routes/app/chat/route";

describe("chat action", () => {
  it("requires a prompt", async () => {
    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      })
    });

    expect(result).toEqual({
      error: "Prompt is required.",
      prompt: null,
      answer: null
    });
  });

  it("returns staged response payload", async () => {
    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "hello");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      })
    });

    expect(result).toEqual({
      error: null,
      prompt: "hello",
      answer:
        "Chat transport is intentionally staged. This shell is ready for codex gateway integration in the next phase."
    });
  });
});
