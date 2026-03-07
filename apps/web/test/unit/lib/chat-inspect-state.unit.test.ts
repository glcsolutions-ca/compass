import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  buildChatInspectSearchParams,
  ChatInspectDrawer,
  parseChatInspectState
} from "~/features/chat/presentation/chat-inspect-drawer";
import type { ChatEvent } from "~/features/chat/thread-types";

const eventRendersInlineMock = vi.hoisted(() => vi.fn());

vi.mock("~/features/chat/runtime-part-parser", () => ({
  eventRendersInline: eventRendersInlineMock
}));

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

describe("chat inspect drawer", () => {
  it("renders scoped terminal/files/diff/raw views and updates inspect state", () => {
    eventRendersInlineMock.mockReturnValue(false);
    const onInspectStateChange = vi.fn();
    const events: ChatEvent[] = [
      {
        cursor: 1,
        threadId: "thread-1",
        turnId: "turn-1",
        method: "item.delta",
        payload: { text: "line-1" },
        createdAt: "2026-03-01T00:00:01.000Z"
      },
      {
        cursor: 2,
        threadId: "thread-1",
        turnId: "turn-1",
        method: "tool.output",
        payload: { stdout: "line-2", path: "src/file-a.ts" },
        createdAt: "2026-03-01T00:00:02.000Z"
      },
      {
        cursor: 3,
        threadId: "thread-1",
        turnId: "turn-1",
        method: "tool.output",
        payload: { diff: "--- a/src/file-a.ts\n+++ b/src/file-a.ts" },
        createdAt: "2026-03-01T00:00:03.000Z"
      }
    ];

    const { rerender } = render(
      createElement(ChatInspectDrawer, {
        events,
        inspectState: { cursor: 2, tab: "activity" },
        onInspectStateChange
      })
    );

    expect(screen.getByText("Execution Details")).toBeTruthy();
    expect(screen.getByText(/tool\.output · cursor 2/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /item\.delta/i }));
    expect(onInspectStateChange).toHaveBeenCalledWith(
      { cursor: 1, tab: "activity" },
      { replace: true }
    );

    const terminalTab = screen.getByRole("tab", { name: "Terminal" });
    fireEvent.pointerDown(terminalTab);
    fireEvent.click(terminalTab);
    rerender(
      createElement(ChatInspectDrawer, {
        events,
        inspectState: { cursor: 2, tab: "terminal" },
        onInspectStateChange
      })
    );
    expect(screen.getByText((content) => content.includes("line-1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("line-2"))).toBeTruthy();

    const filesTab = screen.getByRole("tab", { name: "Files" });
    fireEvent.pointerDown(filesTab);
    fireEvent.click(filesTab);
    rerender(
      createElement(ChatInspectDrawer, {
        events,
        inspectState: { cursor: 2, tab: "files" },
        onInspectStateChange
      })
    );
    expect(screen.getByText("src/file-a.ts")).toBeTruthy();

    const diffTab = screen.getByRole("tab", { name: "Diff" });
    fireEvent.pointerDown(diffTab);
    fireEvent.click(diffTab);
    rerender(
      createElement(ChatInspectDrawer, {
        events,
        inspectState: { cursor: 2, tab: "diff" },
        onInspectStateChange
      })
    );
    expect(screen.getByText(/No diff payload available/i)).toBeTruthy();

    const rawTab = screen.getByRole("tab", { name: "Raw" });
    fireEvent.pointerDown(rawTab);
    fireEvent.click(rawTab);
    rerender(
      createElement(ChatInspectDrawer, {
        events,
        inspectState: { cursor: 2, tab: "raw" },
        onInspectStateChange
      })
    );
    expect(screen.getByText(/"stdout": "line-2"/)).toBeTruthy();

    rerender(
      createElement(ChatInspectDrawer, {
        events,
        inspectState: { cursor: 3, tab: "diff" },
        onInspectStateChange
      })
    );

    expect(screen.getByText(/--- a\/src\/file-a\.ts/)).toBeTruthy();
  });
});
