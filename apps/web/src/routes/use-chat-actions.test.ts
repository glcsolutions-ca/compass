import { describe, expect, it } from "vitest";
import { __private__ } from "~/features/chat/hooks/use-chat-actions";

describe("resolveActiveThreadId", () => {
  it("prefers loader thread id over stale submit result thread id", () => {
    const resolved = __private__.resolveActiveThreadId({
      loaderThreadId: "thread-current",
      submitResultThreadId: "thread-stale"
    });

    expect(resolved).toBe("thread-current");
  });

  it("uses submit result thread id when loader thread id is missing", () => {
    const resolved = __private__.resolveActiveThreadId({
      loaderThreadId: null,
      submitResultThreadId: "thread-created"
    });

    expect(resolved).toBe("thread-created");
  });

  it("returns null when neither source provides a thread id", () => {
    const resolved = __private__.resolveActiveThreadId({
      loaderThreadId: null,
      submitResultThreadId: null
    });

    expect(resolved).toBeNull();
  });
});
