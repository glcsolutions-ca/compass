import { describe, expect, it } from "vitest";
import {
  buildNewThreadHref,
  buildThreadHref,
  resolveNewThreadTarget
} from "~/features/chat/new-thread-routing";

describe("new thread routing", () => {
  it("targets workspace chat routes", () => {
    const target = resolveNewThreadTarget("acme");
    expect(target).toBe("/w/acme/chat");
  });

  it("adds a fresh thread token to workspace chat targets", () => {
    const href = buildNewThreadHref({
      workspaceSlug: "acme",
      threadToken: "thread-123"
    });
    expect(href).toBe("/w/acme/chat?thread=thread-123");
  });

  it("builds deep links for workspace chat thread routes", () => {
    expect(buildThreadHref("acme", "thread_123")).toBe("/w/acme/chat/thread_123");
  });

  it("falls back to /chat when workspace slug is missing", () => {
    expect(resolveNewThreadTarget("")).toBe("/chat");
    expect(buildThreadHref("", "thread_123")).toBe("/chat/thread_123");
  });
});
