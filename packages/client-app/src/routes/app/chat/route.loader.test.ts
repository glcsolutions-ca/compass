import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthShellLoaderData } from "~/features/auth/types";
import { readDefaultExecutionMode } from "~/features/chat/default-execution-mode";
import { loadChatData } from "~/features/chat/chat-loader";

const loadAuthShellDataMock = vi.hoisted(() => vi.fn());
const getChatThreadMock = vi.hoisted(() => vi.fn());
const listChatThreadEventsMock = vi.hoisted(() => vi.fn());
const readPersonalContextLabelMock = vi.hoisted(() => vi.fn());
const resolveThreadCreateWorkspaceSlugMock = vi.hoisted(() => vi.fn());
const buildReturnToMock = vi.hoisted(() => vi.fn());

vi.mock("~/features/auth/shell-loader", () => ({
  loadAuthShellData: loadAuthShellDataMock
}));

vi.mock("~/features/chat/thread-client", () => ({
  getChatThread: getChatThreadMock,
  listChatThreadEvents: listChatThreadEventsMock
}));

vi.mock("~/features/chat/chat-context", () => ({
  readPersonalContextLabel: readPersonalContextLabelMock,
  resolveThreadCreateWorkspaceSlug: resolveThreadCreateWorkspaceSlugMock
}));

vi.mock("~/lib/auth/auth-session", () => ({
  buildReturnTo: buildReturnToMock
}));

function createRequest(url = "https://example.test/chat?workspace=workspace-a"): Request {
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
      threadHandle: undefined
    });

    expect(result).toBe(redirectResponse);
  });

  it("returns default chat data when no thread is selected", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    readPersonalContextLabelMock.mockReturnValue("Personal");
    resolveThreadCreateWorkspaceSlugMock.mockReturnValue("workspace-a");

    const result = await loadChatData({
      request: createRequest("https://example.test/chat"),
      threadHandle: undefined
    });

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({
      workspaceSlug: "workspace-a",
      threadId: null,
      threadHandle: null,
      requestedThreadSeed: null,
      thread: null,
      initialEvents: [],
      initialCursor: 0,
      executionMode: readDefaultExecutionMode()
    });
  });

  it("redirects to fallback workspace query when requested workspace is inaccessible", async () => {
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
    resolveThreadCreateWorkspaceSlugMock.mockReturnValue("workspace-b");

    const result = await loadChatData({
      request: createRequest("https://example.test/chat?workspace=workspace-a"),
      threadHandle: undefined
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/chat?workspace=workspace-b");
  });

  it("redirects to /workspaces when user has no active fallback workspace", async () => {
    loadAuthShellDataMock.mockResolvedValue(
      createAuth({
        activeWorkspaceSlug: null,
        personalWorkspaceSlug: null,
        workspaces: []
      })
    );
    resolveThreadCreateWorkspaceSlugMock.mockImplementation(() => {
      throw new Error("missing workspace");
    });

    const result = await loadChatData({
      request: createRequest("https://example.test/chat"),
      threadHandle: undefined
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/workspaces");
  });

  it("returns login redirect when thread fetch returns 401", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    resolveThreadCreateWorkspaceSlugMock.mockReturnValue("workspace-a");
    buildReturnToMock.mockReturnValue("/return");
    getChatThreadMock.mockResolvedValue({
      status: 401,
      data: null,
      message: null
    });

    const result = await loadChatData({
      request: createRequest("https://example.test/c/69ad25e0-6594-8320-aa96-9569d9f9864a"),
      threadHandle: "69ad25e0-6594-8320-aa96-9569d9f9864a"
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/login?returnTo=%2Freturn");
  });

  it("redirects to the selected workspace when thread is inaccessible", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    resolveThreadCreateWorkspaceSlugMock.mockReturnValue("workspace-a");
    getChatThreadMock.mockResolvedValue({
      status: 404,
      data: null,
      message: null
    });

    const result = await loadChatData({
      request: createRequest(
        "https://example.test/c/69ad25e0-6594-8320-aa96-9569d9f9864a?workspace=workspace-a"
      ),
      threadHandle: "69ad25e0-6594-8320-aa96-9569d9f9864a"
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/chat?workspace=workspace-a");
  });

  it("throws when thread fetch returns no data with non-error status", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    getChatThreadMock.mockResolvedValue({
      status: 200,
      data: null,
      message: "failed to load"
    });

    await expect(
      loadChatData({
        request: createRequest("https://example.test/c/69ad25e0-6594-8320-aa96-9569d9f9864a"),
        threadHandle: "69ad25e0-6594-8320-aa96-9569d9f9864a"
      })
    ).rejects.toThrow("failed to load");
  });

  it("returns login redirect when events fetch returns 401", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    buildReturnToMock.mockReturnValue("/return");
    getChatThreadMock.mockResolvedValue({
      status: 200,
      data: {
        threadId: "thread-1",
        sessionIdentifier: "69ad25e0-6594-8320-aa96-9569d9f9864a",
        workspaceSlug: "workspace-a",
        executionMode: "cloud"
      },
      message: null
    });
    listChatThreadEventsMock.mockResolvedValue({
      status: 401,
      data: null
    });

    const result = await loadChatData({
      request: createRequest("https://example.test/c/69ad25e0-6594-8320-aa96-9569d9f9864a"),
      threadHandle: "69ad25e0-6594-8320-aa96-9569d9f9864a"
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("/login?returnTo=%2Freturn");
  });

  it("returns composed loader data with events when thread exists", async () => {
    loadAuthShellDataMock.mockResolvedValue(createAuth());
    readPersonalContextLabelMock.mockReturnValue("Personal");
    getChatThreadMock.mockResolvedValue({
      status: 200,
      data: {
        threadId: "thread-1",
        sessionIdentifier: "69ad25e0-6594-8320-aa96-9569d9f9864a",
        workspaceSlug: "workspace-b",
        executionMode: "cloud"
      },
      message: null
    });
    listChatThreadEventsMock.mockResolvedValue({
      status: 200,
      data: {
        events: [{ cursor: 1, method: "turn.started" }],
        nextCursor: 5
      }
    });

    const result = await loadChatData({
      request: createRequest(
        "https://example.test/c/69ad25e0-6594-8320-aa96-9569d9f9864a?thread=seed-42"
      ),
      threadHandle: "69ad25e0-6594-8320-aa96-9569d9f9864a"
    });

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toEqual({
      contextMode: "personal",
      contextLabel: "Personal",
      workspaceSlug: "workspace-b",
      threadId: "thread-1",
      threadHandle: "69ad25e0-6594-8320-aa96-9569d9f9864a",
      requestedThreadSeed: "seed-42",
      thread: {
        threadId: "thread-1",
        sessionIdentifier: "69ad25e0-6594-8320-aa96-9569d9f9864a",
        workspaceSlug: "workspace-b",
        executionMode: "cloud"
      },
      initialEvents: [{ cursor: 1, method: "turn.started" }],
      initialCursor: 5,
      executionMode: "cloud"
    });
  });
});
