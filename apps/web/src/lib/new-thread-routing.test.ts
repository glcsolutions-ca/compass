import { describe, expect, it } from "vitest";
import { buildNewThreadHref, resolveNewThreadTarget } from "~/features/chat/new-thread-routing";

describe("new thread routing", () => {
  it("always targets the global chat route", () => {
    const target = resolveNewThreadTarget();
    expect(target).toBe("/chat");
  });

  it("adds a fresh thread token to global chat targets", () => {
    const href = buildNewThreadHref({
      threadToken: "thread-123"
    });
    expect(href).toBe("/chat?thread=thread-123");
  });
});
