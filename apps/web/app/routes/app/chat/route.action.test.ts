import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientAction as chatAction } from "./route";
import {
  createChatThread,
  interruptChatTurn,
  startChatTurn,
  switchChatThreadMode
} from "~/features/chat/thread-client";
import { loadAuthShellData } from "~/features/auth/shell-loader";
import { readDefaultExecutionMode } from "~/features/chat/default-execution-mode";

vi.mock("~/features/chat/thread-client", () => ({
  createChatThread: vi.fn(),
  startChatTurn: vi.fn(),
  switchChatThreadMode: vi.fn(),
  interruptChatTurn: vi.fn()
}));

vi.mock("~/features/auth/shell-loader", () => ({
  loadAuthShellData: vi.fn()
}));

const defaultExecutionMode = readDefaultExecutionMode();

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
      params: {}
    });

    expect(result).toEqual({
      intent: "sendMessage",
      ok: false,
      error: "Prompt is required.",
      threadId: null,
      threadHandle: null,
      turnId: null,
      executionMode: defaultExecutionMode,
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

    vi.mocked(createChatThread).mockResolvedValue({
      status: 201,
      data: {
        threadId: "thread_1",
        workspaceId: "ws_personal",
        workspaceSlug: "personal-user-1",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        status: "idle",
        sessionIdentifier: "69ad25e0-6594-8320-aa96-9569d9f9864a",
        title: "hello",
        archived: false,
        createdAt: null,
        updatedAt: null,
        modeSwitchedAt: null
      },
      error: null,
      message: null
    });

    vi.mocked(startChatTurn).mockResolvedValue({
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
    formData.set("clientRequestId", "req_hello_1");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      }),
      params: {}
    });

    expect(createChatThread).toHaveBeenCalledTimes(1);
    const [createThreadRequest, createThreadPayload] =
      vi.mocked(createChatThread).mock.calls[0] ?? [];
    expect(createThreadRequest).toBeInstanceOf(Request);
    expect(createThreadPayload).toEqual({
      workspaceSlug: "personal-user-1",
      executionMode: defaultExecutionMode,
      title: "hello"
    });
    const [startTurnRequest, startTurnPayload] = vi.mocked(startChatTurn).mock.calls[0] ?? [];
    expect(startTurnRequest).toBeInstanceOf(Request);
    expect(startTurnPayload).toEqual({
      threadId: "thread_1",
      text: "hello",
      executionMode: defaultExecutionMode,
      clientRequestId: "req_hello_1"
    });
    expect(result).toEqual({
      intent: "sendMessage",
      ok: true,
      error: null,
      threadId: "thread_1",
      threadHandle: "69ad25e0-6594-8320-aa96-9569d9f9864a",
      turnId: "turn_1",
      executionMode: "cloud",
      prompt: "hello",
      answer: "response",
      clientRequestId: "req_hello_1"
    });
  });

  it("resolves workspace slug from auth context when posting from /chat", async () => {
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

    vi.mocked(createChatThread).mockResolvedValue({
      status: 201,
      data: {
        threadId: "thread_2",
        workspaceId: "ws_personal",
        workspaceSlug: "personal-user-1",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        status: "idle",
        sessionIdentifier: "69ad25e0-6594-8320-aa96-9569d9f9864b",
        title: "hello from chat",
        archived: false,
        createdAt: null,
        updatedAt: null,
        modeSwitchedAt: null
      },
      error: null,
      message: null
    });

    vi.mocked(startChatTurn).mockResolvedValue({
      status: 200,
      data: {
        turnId: "turn_2",
        threadId: "thread_2",
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
    formData.set("prompt", "hello from chat");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      }),
      params: {}
    });

    const [createThreadRequest, createThreadPayload] =
      vi.mocked(createChatThread).mock.calls[0] ?? [];
    expect(createThreadRequest).toBeInstanceOf(Request);
    expect(createThreadPayload).toEqual({
      workspaceSlug: "personal-user-1",
      executionMode: defaultExecutionMode,
      title: "hello from chat"
    });
    expect(result).toEqual({
      intent: "sendMessage",
      ok: true,
      error: null,
      threadId: "thread_2",
      threadHandle: "69ad25e0-6594-8320-aa96-9569d9f9864b",
      turnId: "turn_2",
      executionMode: "cloud",
      prompt: "hello from chat",
      answer: "response"
    });
  });

  it("preserves client request id when thread creation fails", async () => {
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

    vi.mocked(createChatThread).mockResolvedValue({
      status: 403,
      data: null,
      error: "FORBIDDEN",
      message: "Forbidden."
    });

    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "blocked prompt");
    formData.set("clientRequestId", "req-blocked-1");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      }),
      params: {}
    });

    expect(startChatTurn).not.toHaveBeenCalled();
    expect(result).toEqual({
      intent: "sendMessage",
      ok: false,
      error: "Forbidden.",
      threadId: null,
      threadHandle: null,
      turnId: null,
      executionMode: defaultExecutionMode,
      prompt: "blocked prompt",
      answer: null,
      clientRequestId: "req-blocked-1"
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

    expect(createChatThread).not.toHaveBeenCalled();
    expect(result).toEqual({
      intent: "sendMessage",
      ok: false,
      error: "Workspace membership is required but was not found in /v1/auth/me.",
      threadId: null,
      threadHandle: null,
      turnId: null,
      executionMode: defaultExecutionMode,
      prompt: "hello",
      answer: null
    });
  });

  it("interrupts active turns", async () => {
    vi.mocked(interruptChatTurn).mockResolvedValue({
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
      request: new Request("http://web.test/chat/69ad25e0-6594-8320-aa96-9569d9f9864a", {
        method: "POST",
        body: formData
      }),
      params: {
        workspaceSlug: "personal-user-1",
        threadId: "thread_1"
      }
    });

    expect(interruptChatTurn).toHaveBeenCalledWith(expect.any(Request), {
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
    vi.mocked(switchChatThreadMode).mockResolvedValue({
      status: 200,
      data: {
        threadId: "thread_1",
        workspaceId: "ws_personal",
        workspaceSlug: "personal-user-1",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        status: "idle",
        sessionIdentifier: null,
        title: "thread",
        archived: false,
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
    formData.set("executionMode", "cloud");

    const result = await chatAction({
      request: new Request("http://web.test/chat/69ad25e0-6594-8320-aa96-9569d9f9864a", {
        method: "POST",
        body: formData
      }),
      params: {
        workspaceSlug: "personal-user-1",
        threadId: "thread_1"
      }
    });

    expect(switchChatThreadMode).toHaveBeenCalledWith(expect.any(Request), {
      threadId: "thread_1",
      executionMode: "cloud"
    });
    expect(result).toMatchObject({
      intent: "switchMode",
      ok: true,
      threadId: "thread_1",
      executionMode: "cloud"
    });
  });

  it("submits local mode send attempts through the agent API", async () => {
    vi.mocked(startChatTurn).mockResolvedValue({
      status: 200,
      data: {
        turnId: "turn_local_1",
        threadId: "thread_1",
        status: "completed",
        executionMode: "local",
        executionHost: "desktop_local",
        input: null,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null,
        outputText: "echo:hello"
      },
      error: null,
      message: null
    });

    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("threadId", "thread_1");
    formData.set("executionMode", "local");
    formData.set("prompt", "hello");

    const result = await chatAction({
      request: new Request("http://web.test/chat/69ad25e0-6594-8320-aa96-9569d9f9864a", {
        method: "POST",
        body: formData
      }),
      params: {}
    });

    expect(createChatThread).not.toHaveBeenCalled();
    expect(startChatTurn).toHaveBeenCalledWith(expect.any(Request), {
      threadId: "thread_1",
      text: "hello",
      executionMode: "local"
    });
    expect(result).toEqual({
      intent: "sendMessage",
      ok: true,
      error: null,
      threadId: "thread_1",
      threadHandle: null,
      turnId: "turn_local_1",
      executionMode: "local",
      prompt: "hello",
      answer: "echo:hello"
    });
  });
});
