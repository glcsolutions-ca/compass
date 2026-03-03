import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthShellLoaderData } from "~/features/auth/types";
import { loadChatData } from "~/features/chat/chat-loader";

const loadAuthShellDataMock = vi.hoisted(() => vi.fn());
const getAgentThreadMock = vi.hoisted(() => vi.fn());
const listAgentThreadEventsMock = vi.hoisted(() => vi.fn());
const readPersonalContextLabelMock = vi.hoisted(() => vi.fn());
const buildReturnToMock = vi.hoisted(() => vi.fn());

vi.mock("~/features/auth/shell-loader", () => ({
  loadAuthShellData: loadAuthShellDataMock
}));

vi.mock("~/features/chat/agent-client", () => ({
  getAgentThread: getAgentThreadMock,
  listAgentThreadEvents: listAgentThreadEventsMock
}));

vi.mock("~/features/chat/chat-context", () => ({
  readPersonalContextLabel: readPersonalContextLabelMock
}));

vi.mock("~/lib/auth/auth-session", () => ({
  buildReturnTo: buildReturnToMock
}));

function createRequest(url = "https://example.test/w/workspace-a/chat"): Request {
  return new Request(url, { method: "GET" });
}

function createAuth(overrides: Partial<AuthShellLoaderData> = {}): AuthShellLoaderData {
  return {
    authenticated: true,
    user: {
      id: "user_1",
      primaryEmail: "user@example.com",
      displayName: "User"
    },
    organizations: [],
    workspaces: [
      {
        id: "ws_1",
        organizationId: "org_1",
        organizationSlug: "org",
        organizationName: "Org",
        slug: "workspace-a",
        name: "Workspace A",
        isPersonal: true,
        role: "admin",
        status: "active"
      }
    ],
    activeWorkspaceSlug: "workspace-a",
    personalWorkspaceSlug: "workspace-a",
    ...overrides
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("loadChatData", () => {
  it("returns auth redirect response unchanged", async () => {
    const redirectResponse = new Response(null, { status: 302 });
    loadAuthShellDataMock.mockResolvedValue(redirectResponse);

    const result = await loadChatData({
      request: createRequest(),
      workspaceSlug: "workspace-a",
      threadId: undefined
    });

    expect(result).toBe(redirectResponse);
  });

  it("redirects to /chat when workspace slug is missing", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());

    const result = await loadChatData({
      request: createRequest("https://example.test/chat"),
      workspaceSlug: undefined,
      threadId: undefined
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("location")).toBe("/chat");
  });

  it("redirects to fallback workspace when user cannot access requested workspace", async () => {
    loadAuthShellDataMock.mockResolvedValue(
      createAuth({
        activeWorkspaceSlug: "workspace-b",
        personalWorkspaceSlug: "workspace-b",
        workspaces: [
          {
            id: "ws_2",
            organizationId: "org_2",
            organizationSlug: "org-2",
            organizationName: "Org 2",
            slug: "workspace-b",
            name: "Workspace B",
            isPersonal: true,
            role: "admin",
            status: "active"
          }
        ]
      })
    );

    const result = await loadChatData({
      request: createRequest(),
      workspaceSlug: "workspace-a",
      threadId: undefined
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/w/workspace-b/chat");
  });

  it("redirects to /workspaces when user has no active fallback workspace", async () => {
    loadAuthShellDataMock.mockResolvedValue(
      createAuth({
        activeWorkspaceSlug: null,
        personalWorkspaceSlug: null,
        workspaces: []
      })
    );

    const result = await loadChatData({
      request: createRequest(),
      workspaceSlug: "workspace-a",
      threadId: undefined
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/workspaces");
  });

  it("returns login redirect when thread fetch returns 401", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    buildReturnToMock.mockReturnValue("/return");
    getAgentThreadMock.mockResolvedValue({
      status: 401,
      data: null,
      message: null
    });

    const result = await loadChatData({
      request: createRequest(),
      workspaceSlug: "workspace-a",
      threadId: "thread-1"
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/login?returnTo=%2Freturn");
  });

  it("redirects to workspace chat when thread is inaccessible", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    getAgentThreadMock.mockResolvedValue({
      status: 404,
      data: null,
      message: null
    });

    const result = await loadChatData({
      request: createRequest(),
      workspaceSlug: "workspace-a",
      threadId: "thread-1"
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/w/workspace-a/chat");
  });

  it("throws when thread fetch returns no data with non-error status", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    getAgentThreadMock.mockResolvedValue({
      status: 200,
      data: null,
      message: "failed to load"
    });

    await expect(
      loadChatData({
        request: createRequest(),
        workspaceSlug: "workspace-a",
        threadId: "thread-1"
      })
    ).rejects.toThrow("failed to load");
  });

  it("redirects to thread's workspace when it differs from route workspace", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    getAgentThreadMock.mockResolvedValue({
      status: 200,
      data: {
        threadId: "thread-1",
        workspaceSlug: "workspace-b",
        executionMode: "cloud"
      },
      message: null
    });

    const result = await loadChatData({
      request: createRequest(),
      workspaceSlug: "workspace-a",
      threadId: "thread-1"
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/w/workspace-b/chat/thread-1");
  });

  it("returns login redirect when events fetch returns 401", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    buildReturnToMock.mockReturnValue("/return");
    getAgentThreadMock.mockResolvedValue({
      status: 200,
      data: {
        threadId: "thread-1",
        workspaceSlug: "workspace-a",
        executionMode: "cloud"
      },
      message: null
    });
    listAgentThreadEventsMock.mockResolvedValue({
      status: 401,
      data: null
    });

    const result = await loadChatData({
      request: createRequest(),
      workspaceSlug: "workspace-a",
      threadId: "thread-1"
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/login?returnTo=%2Freturn");
  });

  it("returns composed loader data with events when thread exists", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    readPersonalContextLabelMock.mockReturnValue("Personal");
    getAgentThreadMock.mockResolvedValue({
      status: 200,
      data: {
        threadId: "thread-1",
        workspaceSlug: "workspace-a",
        executionMode: "cloud"
      },
      message: null
    });
    listAgentThreadEventsMock.mockResolvedValue({
      status: 200,
      data: {
        events: [{ cursor: 1, method: "turn.started" }],
        nextCursor: 5
      }
    });

    const result = await loadChatData({
      request: createRequest("https://example.test/w/workspace-a/chat?thread=seed-42"),
      workspaceSlug: "workspace-a",
      threadId: "thread-1"
    });

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toEqual({
      contextMode: "personal",
      contextLabel: "Personal",
      workspaceSlug: "workspace-a",
      threadId: "thread-1",
      requestedThreadSeed: "seed-42",
      thread: {
        threadId: "thread-1",
        workspaceSlug: "workspace-a",
        executionMode: "cloud"
      },
      initialEvents: [{ cursor: 1, method: "turn.started" }],
      initialCursor: 5,
      executionMode: "cloud"
    });
  });

  it("returns defaults when no thread is selected", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    readPersonalContextLabelMock.mockReturnValue("Personal");

    const result = await loadChatData({
      request: createRequest("https://example.test/w/workspace-a/chat"),
      workspaceSlug: "workspace-a",
      threadId: undefined
    });

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({
      workspaceSlug: "workspace-a",
      threadId: null,
      requestedThreadSeed: null,
      thread: null,
      initialEvents: [],
      initialCursor: 0,
      executionMode: "cloud"
    });
    expect(getAgentThreadMock).not.toHaveBeenCalled();
    expect(listAgentThreadEventsMock).not.toHaveBeenCalled();
  });
});
