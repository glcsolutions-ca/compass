import { describe, expect, it } from "vitest";
import {
  buildChatInspectSearchParams,
  parseChatInspectState
} from "~/features/chat/presentation/chat-inspect-drawer";

describe("chat inspect URL state", () => {
  it("parses valid cursor and tab values", () => {
    const state = parseChatInspectState(new URLSearchParams("inspect=42&inspectTab=diff"));
    expect(state).toEqual({
      cursor: 42,
      tab: "diff"
    });
  });

  it("falls back safely for invalid values", () => {
    const state = parseChatInspectState(new URLSearchParams("inspect=foo&inspectTab=bad"));
    expect(state).toEqual({
      cursor: null,
      tab: "activity"
    });
  });

  it("removes inspect params while preserving unrelated query params", () => {
    const next = buildChatInspectSearchParams(
      new URLSearchParams("foo=1&inspect=7&inspectTab=raw"),
      {
        cursor: null,
        tab: "activity"
      }
    );

    expect(next.toString()).toBe("foo=1");
  });

  it("sets inspect params while preserving unrelated query params", () => {
    const next = buildChatInspectSearchParams(new URLSearchParams("foo=1"), {
      cursor: 19,
      tab: "terminal"
    });

    expect(next.get("foo")).toBe("1");
    expect(next.get("inspect")).toBe("19");
    expect(next.get("inspectTab")).toBe("terminal");
  });
});
