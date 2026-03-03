import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatThreadRail } from "~/components/shell/chat-thread-rail";
import type { AgentThread } from "~/features/chat/agent-types";

const { listAgentThreadsClientMock } = vi.hoisted(() => ({
  listAgentThreadsClientMock:
    vi.fn<
      (payload: {
        workspaceSlug: string;
        state?: "regular" | "archived" | "all";
        limit?: number;
        baseUrl?: string;
      }) => Promise<AgentThread[]>
    >()
}));

vi.mock("~/features/chat/agent-client", () => ({
  listAgentThreadsClient: listAgentThreadsClientMock,
  patchAgentThreadClient: vi.fn(async () => ({})),
  deleteAgentThreadClient: vi.fn(async () => ({ deleted: true }))
}));

describe("chat thread rail", () => {
  beforeEach(() => {
    listAgentThreadsClientMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an empty state when no threads are returned", async () => {
    listAgentThreadsClientMock.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/w/personal-user-1/chat"]}>
        <ChatThreadRail defaultWorkspaceSlug="personal-user-1" pathname="/w/personal-user-1/chat" />
      </MemoryRouter>
    );

    expect(await screen.findByText("No threads yet.")).toBeTruthy();
    expect(listAgentThreadsClientMock).toHaveBeenCalledWith({
      workspaceSlug: "personal-user-1",
      state: "all",
      limit: 60
    });
  });

  it("renders regular and archived thread sections from API data", async () => {
    listAgentThreadsClientMock.mockResolvedValue([
      {
        threadId: "thread-live-1",
        workspaceId: "workspace-1",
        workspaceSlug: "personal-user-1",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        status: "completed",
        cloudSessionIdentifier: "thr-thread-live-1",
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
        cloudSessionIdentifier: "thr-thread-archived-1",
        title: "Archived thread",
        archived: true,
        createdAt: "2026-02-26T00:00:00.000Z",
        updatedAt: "2026-02-26T00:00:00.000Z",
        modeSwitchedAt: null
      }
    ]);

    render(
      <MemoryRouter initialEntries={["/w/personal-user-1/chat"]}>
        <ChatThreadRail defaultWorkspaceSlug="personal-user-1" pathname="/w/personal-user-1/chat" />
      </MemoryRouter>
    );

    expect(await screen.findByText("Fresh thread title")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByText("Archived thread")).toBeTruthy();
  });
});
