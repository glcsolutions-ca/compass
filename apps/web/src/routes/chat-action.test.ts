import { describe, expect, it } from "vitest";
import { submitTenantChatAction } from "~/routes/app.t.$tenantSlug.chat/action";

describe("tenant chat action", () => {
  it("requires a prompt", async () => {
    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "");

    const result = await submitTenantChatAction({
      request: new Request("http://web.test/t/acme/chat", {
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

    const result = await submitTenantChatAction({
      request: new Request("http://web.test/t/acme/chat", {
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
