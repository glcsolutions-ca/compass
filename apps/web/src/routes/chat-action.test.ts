import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientAction as chatAction } from "~/routes/app/chat/route";
import {
  createAgentThread,
  interruptAgentTurn,
  startAgentTurn,
  switchAgentThreadMode
} from "~/features/chat/agent-client";
import { loadAuthShellData } from "~/features/auth/shell-loader";

vi.mock("~/features/chat/agent-client", () => ({
  createAgentThread: vi.fn(),
  startAgentTurn: vi.fn(),
  switchAgentThreadMode: vi.fn(),
  interruptAgentTurn: vi.fn()
}));

vi.mock("~/features/auth/shell-loader", () => ({
  loadAuthShellData: vi.fn()
}));

describe("chat action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires a prompt for send intent", async () => {
    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      }),
      params: { workspaceSlug: "personal-user-1" }
    });

    expect(result).toEqual({
      intent: "sendMessage",
      ok: false,
      error: "Prompt is required.",
      threadId: null,
      turnId: null,
      executionMode: "cloud",
      prompt: null,
      answer: null
    });
  });

  it("creates a new thread and starts a turn", async () => {
    vi.mocked(loadAuthShellData).mockResolvedValue({
      authenticated: true,
      user: {
        id: "user_1",
        primaryEmail: "user@example.com",
        displayName: "User"
      },
      organizations: [
        {
          organizationId: "org_personal",
          organizationSlug: "personal-org",
          organizationName: "Personal Organization",
          role: "member",
          status: "active"
        }
      ],
      workspaces: [
        {
          id: "ws_personal",
          organizationId: "org_personal",
          organizationSlug: "personal-org",
          organizationName: "Personal Organization",
          slug: "personal-user-1",
          name: "User Personal Workspace",
          isPersonal: true,
          role: "admin",
          status: "active"
        }
      ],
      activeWorkspaceSlug: "personal-user-1",
      personalWorkspaceSlug: "personal-user-1"
    });

    vi.mocked(createAgentThread).mockResolvedValue({
      status: 201,
      data: {
        threadId: "thread_1",
        workspaceId: "ws_personal",
        workspaceSlug: "personal-user-1",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        status: "idle",
        cloudSessionIdentifier: null,
        title: "hello",
        createdAt: null,
        updatedAt: null,
        modeSwitchedAt: null
      },
      error: null,
      message: null
    });

    vi.mocked(startAgentTurn).mockResolvedValue({
      status: 200,
      data: {
        turnId: "turn_1",
        threadId: "thread_1",
        status: "completed",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        input: null,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
        outputText: "response"
      },
      error: null,
      message: null
    });

    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "hello");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      }),
      params: { workspaceSlug: "personal-user-1" }
    });

    expect(createAgentThread).toHaveBeenCalledTimes(1);
    expect(createAgentThread).toHaveBeenCalledWith(expect.any(Request), {
      workspaceSlug: "personal-user-1",
      executionMode: "cloud",
      title: "hello"
    });
    expect(startAgentTurn).toHaveBeenCalledWith(expect.any(Request), {
      threadId: "thread_1",
      text: "hello",
      executionMode: "cloud"
    });
    expect(result).toEqual({
      intent: "sendMessage",
      ok: true,
      error: null,
      threadId: "thread_1",
      turnId: "turn_1",
      executionMode: "cloud",
      prompt: "hello",
      answer: "response"
    });
  });

  it("fails closed when auth workspaces are unexpectedly empty", async () => {
    vi.mocked(loadAuthShellData).mockResolvedValue({
      authenticated: true,
      user: {
        id: "user_1",
        primaryEmail: "user@example.com",
        displayName: "User"
      },
      organizations: [],
      workspaces: [],
      activeWorkspaceSlug: null,
      personalWorkspaceSlug: null
    });

    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "hello");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      }),
      params: {}
    });

    expect(createAgentThread).not.toHaveBeenCalled();
    expect(result).toEqual({
      intent: "sendMessage",
      ok: false,
      error: "Workspace membership is required but was not found in /v1/auth/me.",
      threadId: null,
      turnId: null,
      executionMode: "cloud",
      prompt: "hello",
      answer: null
    });
  });

  it("interrupts active turns", async () => {
    vi.mocked(interruptAgentTurn).mockResolvedValue({
      status: 200,
      data: {
        turnId: "turn_1",
        threadId: "thread_1",
        status: "interrupted",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        input: null,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
        outputText: null
      },
      error: null,
      message: null
    });

    const formData = new FormData();
    formData.set("intent", "interruptTurn");
    formData.set("threadId", "thread_1");
    formData.set("turnId", "turn_1");

    const result = await chatAction({
      request: new Request("http://web.test/w/personal-user-1/chat/thread_1", {
        method: "POST",
        body: formData
      }),
      params: {
        workspaceSlug: "personal-user-1",
        threadId: "thread_1"
      }
    });

    expect(interruptAgentTurn).toHaveBeenCalledWith(expect.any(Request), {
      threadId: "thread_1",
      turnId: "turn_1"
    });
    expect(result).toMatchObject({
      intent: "interruptTurn",
      ok: true,
      threadId: "thread_1",
      turnId: "turn_1",
      executionMode: "cloud"
    });
  });

  it("switches execution mode for active threads", async () => {
    vi.mocked(switchAgentThreadMode).mockResolvedValue({
      status: 200,
      data: {
        threadId: "thread_1",
        workspaceId: "ws_personal",
        workspaceSlug: "personal-user-1",
        executionMode: "local",
        executionHost: "desktop_local",
        status: "idle",
        cloudSessionIdentifier: null,
        title: "thread",
        createdAt: null,
        updatedAt: null,
        modeSwitchedAt: null
      },
      error: null,
      message: null
    });

    const formData = new FormData();
    formData.set("intent", "switchMode");
    formData.set("threadId", "thread_1");
    formData.set("executionMode", "local");

    const result = await chatAction({
      request: new Request("http://web.test/w/personal-user-1/chat/thread_1", {
        method: "POST",
        body: formData
      }),
      params: {
        workspaceSlug: "personal-user-1",
        threadId: "thread_1"
      }
    });

    expect(switchAgentThreadMode).toHaveBeenCalledWith(expect.any(Request), {
      threadId: "thread_1",
      executionMode: "local"
    });
    expect(result).toMatchObject({
      intent: "switchMode",
      ok: true,
      threadId: "thread_1",
      executionMode: "local"
    });
  });
});
