import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatThreadRail } from "~/layout/chat-thread-rail";
import type { ChatThread } from "~/features/chat/thread-types";

const { listChatThreadsClientMock } = vi.hoisted(() => ({
  listChatThreadsClientMock:
    vi.fn<
      (payload: {
        workspaceSlug: string;
        state?: "regular" | "archived" | "all";
        limit?: number;
        baseUrl?: string;
      }) => Promise<ChatThread[]>
    >()
}));

vi.mock("~/features/chat/thread-client", () => ({
  listChatThreadsClient: listChatThreadsClientMock,
  patchChatThreadClient: vi.fn(async () => ({})),
  deleteChatThreadClient: vi.fn(async () => ({ deleted: true }))
}));

describe("chat thread rail", () => {
  beforeEach(() => {
    listChatThreadsClientMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an empty state when no threads are returned", async () => {
    listChatThreadsClientMock.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatThreadRail activeWorkspaceSlug="personal-user-1" pathname="/chat" />
      </MemoryRouter>
    );

    expect(await screen.findByText("No threads yet.")).toBeTruthy();
    expect(listChatThreadsClientMock).toHaveBeenCalledWith({
      workspaceSlug: "personal-user-1",
      state: "all",
      limit: 60
    });
  });

  it("renders regular and archived thread sections from API data", async () => {
    listChatThreadsClientMock.mockResolvedValue([
      {
        threadId: "thread-live-1",
        workspaceId: "workspace-1",
        workspaceSlug: "personal-user-1",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        status: "completed",
        sessionIdentifier: "thr-thread-live-1",
        title: "Fresh thread title",
        archived: false,
        createdAt: "2026-02-27T00:00:00.000Z",
        updatedAt: "2026-02-27T00:00:00.000Z",
        modeSwitchedAt: null
      },
      {
        threadId: "thread-archived-1",
        workspaceId: "workspace-1",
        workspaceSlug: "personal-user-1",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        status: "completed",
        sessionIdentifier: "thr-thread-archived-1",
        title: "Archived thread",
        archived: true,
        createdAt: "2026-02-26T00:00:00.000Z",
        updatedAt: "2026-02-26T00:00:00.000Z",
        modeSwitchedAt: null
      }
    ]);

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatThreadRail activeWorkspaceSlug="personal-user-1" pathname="/chat" />
      </MemoryRouter>
    );

    expect(await screen.findByText("Fresh thread title")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByText("Archived thread")).toBeTruthy();
  });
});
