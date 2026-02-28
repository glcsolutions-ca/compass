import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { ChatThreadRail } from "~/components/shell/chat-thread-rail";
import { upsertChatThreadHistoryItem } from "~/features/chat/chat-thread-history";

describe("chat thread rail", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("updates thread list when local history changes without pathname changes", async () => {
    render(
      <MemoryRouter initialEntries={["/w/personal-user-1/chat"]}>
        <ChatThreadRail defaultWorkspaceSlug="personal-user-1" pathname="/w/personal-user-1/chat" />
      </MemoryRouter>
    );

    expect(screen.getByText("No recent threads.")).toBeTruthy();

    act(() => {
      upsertChatThreadHistoryItem({
        threadId: "thread_live_1",
        workspaceSlug: "personal-user-1",
        title: "Fresh thread title",
        executionMode: "cloud",
        status: "inProgress"
      });
    });

    expect(await screen.findByText("Fresh thread title")).toBeTruthy();
  });
});
