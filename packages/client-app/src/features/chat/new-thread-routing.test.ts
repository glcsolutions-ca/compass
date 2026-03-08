import { describe, expect, it } from "vitest";
import {
  buildNewThreadHref,
  buildThreadHref,
  resolveNewThreadTarget
} from "~/features/chat/new-thread-routing";

describe("new thread routing", () => {
  it("targets workspace chat routes", () => {
    const target = resolveNewThreadTarget("acme");
    expect(target).toBe("/chat");
  });

  it("keeps new-thread hrefs on the canonical chat route", () => {
    const href = buildNewThreadHref({
      workspaceSlug: "acme",
      threadToken: "thread-123"
    });
    expect(href).toBe("/chat");
  });

  it("builds deep links for chat thread routes", () => {
    expect(buildThreadHref("69ad25e0-6594-8320-aa96-9569d9f9864a")).toBe(
      "/c/69ad25e0-6594-8320-aa96-9569d9f9864a"
    );
  });

  it("falls back to /chat when workspace slug is missing", () => {
    expect(resolveNewThreadTarget("")).toBe("/chat");
    expect(buildThreadHref("")).toBe("/chat");
  });
});
