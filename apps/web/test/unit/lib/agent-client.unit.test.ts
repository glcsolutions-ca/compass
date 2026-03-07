import { beforeEach, describe, expect, it, vi } from "vitest";

const routeClientMock = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  DELETE: vi.fn()
}));

const browserClientMock = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PATCH: vi.fn(),
  DELETE: vi.fn()
}));

const createCompassClientMock = vi.hoisted(() => vi.fn());
const readApiErrorMessageMock = vi.hoisted(() => vi.fn());
const createApiClientMock = vi.hoisted(() => vi.fn());

const contractSchemaMocks = vi.hoisted(() => ({
  AgentEventSchema: { safeParse: vi.fn() },
  AgentEventsBatchResponseSchema: { safeParse: vi.fn() },
  AgentEventsListResponseSchema: { safeParse: vi.fn() },
  AgentThreadCreateResponseSchema: { safeParse: vi.fn() },
  AgentThreadDeleteResponseSchema: { safeParse: vi.fn() },
  AgentThreadListResponseSchema: { safeParse: vi.fn() },
  AgentThreadModePatchResponseSchema: { safeParse: vi.fn() },
  AgentThreadPatchResponseSchema: { safeParse: vi.fn() },
  AgentThreadReadResponseSchema: { safeParse: vi.fn() },
  AgentTurnInterruptResponseSchema: { safeParse: vi.fn() },
  AgentTurnStartResponseSchema: { safeParse: vi.fn() }
}));

vi.mock("~/lib/api/compass-client", () => ({
  createCompassClient: createCompassClientMock,
  readApiErrorMessage: readApiErrorMessageMock
}));

vi.mock("@compass/sdk", () => ({
  createApiClient: createApiClientMock
}));

vi.mock("@compass/contracts", () => contractSchemaMocks);

import {
  appendAgentThreadEventsBatchClient,
  createAgentThread,
  deleteAgentThreadClient,
  getAgentThread,
  interruptAgentTurn,
  listAgentThreadEvents,
  listAgentThreadEventsClient,
  listAgentThreads,
  listAgentThreadsClient,
  parseStreamEventPayload,
  patchAgentThreadClient,
  startAgentTurn,
  switchAgentThreadMode
} from "~/features/chat/agent-client";

function makeResult(status: number, data: unknown, error?: unknown) {
  return {
    response: new Response(null, { status }),
    data,
    error
  };
}

describe("agent client", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    createCompassClientMock.mockReturnValue(routeClientMock);
    createApiClientMock.mockReturnValue(browserClientMock);
    readApiErrorMessageMock.mockReturnValue("api-error");
  });

  it("createAgentThread maps parsed thread payload", async () => {
    const thread = { threadId: "thread_1", title: "Hello" };
    const rawError = { code: "non-fatal" };

    routeClientMock.POST.mockResolvedValue(makeResult(201, { raw: true }, rawError));
    contractSchemaMocks.AgentThreadCreateResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { thread }
    });

    const result = await createAgentThread(new Request("http://web.test"), {
      workspaceSlug: "ws_1",
      executionMode: "cloud",
      title: "Hello"
    });

    expect(routeClientMock.POST).toHaveBeenCalledWith("/v1/agent/threads", {
      credentials: "include",
      body: {
        workspaceSlug: "ws_1",
        executionMode: "cloud",
        title: "Hello"
      }
    });
    expect(contractSchemaMocks.AgentThreadCreateResponseSchema.safeParse).toHaveBeenCalledWith({
      raw: true
    });
    expect(readApiErrorMessageMock).toHaveBeenCalledWith(rawError, "");
    expect(result).toEqual({
      status: 201,
      data: thread,
      error: rawError,
      message: "api-error"
    });
  });

  it("createAgentThread returns null data when parse fails", async () => {
    routeClientMock.POST.mockResolvedValue(makeResult(201, { invalid: true }));
    contractSchemaMocks.AgentThreadCreateResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await createAgentThread(new Request("http://web.test"), {
      workspaceSlug: "ws_1",
      executionMode: "cloud"
    });

    expect(result).toEqual({
      status: 201,
      data: null,
      error: null,
      message: "api-error"
    });
  });

  it("listAgentThreads maps parsed threads payload", async () => {
    const threads = [{ threadId: "thread_1" }, { threadId: "thread_2" }];

    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadListResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { threads }
    });

    const result = await listAgentThreads(new Request("http://web.test"), {
      workspaceSlug: "ws_1",
      state: "archived",
      limit: 10
    });

    expect(routeClientMock.GET).toHaveBeenCalledWith("/v1/agent/threads", {
      credentials: "include",
      params: {
        query: {
          workspaceSlug: "ws_1",
          state: "archived",
          limit: 10
        }
      }
    });
    expect(result.data).toEqual(threads);
  });

  it("listAgentThreads returns null data when parse fails", async () => {
    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadListResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await listAgentThreads(new Request("http://web.test"), {
      workspaceSlug: "ws_1"
    });

    expect(result.data).toBeNull();
  });

  it("listAgentThreadsClient returns parsed threads", async () => {
    const threads = [{ threadId: "thread_1" }];

    browserClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadListResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { threads }
    });

    const result = await listAgentThreadsClient({
      workspaceSlug: "ws_1",
      state: "regular",
      limit: 5,
      baseUrl: "https://api.example.test"
    });

    expect(createApiClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.example.test",
        fetch: expect.any(Function)
      })
    );
    expect(browserClientMock.GET).toHaveBeenCalledWith("/v1/agent/threads", {
      credentials: "include",
      params: {
        query: {
          workspaceSlug: "ws_1",
          state: "regular",
          limit: 5
        }
      }
    });
    expect(result).toEqual(threads);
  });

  it("listAgentThreadsClient falls back to [] when parse fails", async () => {
    browserClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadListResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await listAgentThreadsClient({
      workspaceSlug: "ws_1",
      baseUrl: "http://web.test"
    });

    expect(result).toEqual([]);
  });

  it("getAgentThread maps parsed thread payload", async () => {
    const thread = { threadId: "thread_1", title: "Title" };

    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadReadResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { thread }
    });

    const result = await getAgentThread(new Request("http://web.test"), "thread_1");

    expect(routeClientMock.GET).toHaveBeenCalledWith("/v1/agent/threads/{threadId}", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        }
      }
    });
    expect(result.data).toEqual(thread);
  });

  it("getAgentThread returns null data when parse fails", async () => {
    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadReadResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await getAgentThread(new Request("http://web.test"), "thread_1");

    expect(result.data).toBeNull();
  });

  it("patchAgentThreadClient returns parsed thread", async () => {
    const thread = { threadId: "thread_1", title: "Renamed" };

    browserClientMock.PATCH.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadPatchResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { thread }
    });

    const result = await patchAgentThreadClient({
      threadId: "thread_1",
      title: "Renamed",
      archived: true,
      baseUrl: "http://web.test"
    });

    expect(browserClientMock.PATCH).toHaveBeenCalledWith("/v1/agent/threads/{threadId}", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        }
      },
      body: {
        title: "Renamed",
        archived: true
      }
    });
    expect(result).toEqual(thread);
  });

  it("patchAgentThreadClient throws when parse fails", async () => {
    browserClientMock.PATCH.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadPatchResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    await expect(
      patchAgentThreadClient({ threadId: "thread_1", baseUrl: "http://web.test" })
    ).rejects.toThrow("Unable to update chat thread.");
  });

  it("deleteAgentThreadClient returns parsed delete payload", async () => {
    browserClientMock.DELETE.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadDeleteResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { deleted: true }
    });

    const result = await deleteAgentThreadClient({
      threadId: "thread_1",
      baseUrl: "http://web.test"
    });

    expect(browserClientMock.DELETE).toHaveBeenCalledWith("/v1/agent/threads/{threadId}", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        }
      }
    });
    expect(result).toEqual({ deleted: true });
  });

  it("deleteAgentThreadClient throws when parse fails", async () => {
    browserClientMock.DELETE.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadDeleteResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    await expect(
      deleteAgentThreadClient({ threadId: "thread_1", baseUrl: "http://web.test" })
    ).rejects.toThrow("Unable to delete chat thread.");
  });

  it("switchAgentThreadMode maps parsed thread payload", async () => {
    const thread = { threadId: "thread_1", executionMode: "local" };

    routeClientMock.PATCH.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadModePatchResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { thread }
    });

    const result = await switchAgentThreadMode(new Request("http://web.test"), {
      threadId: "thread_1",
      executionMode: "local"
    });

    expect(routeClientMock.PATCH).toHaveBeenCalledWith("/v1/agent/threads/{threadId}/mode", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        }
      },
      body: {
        executionMode: "local"
      }
    });
    expect(result.data).toEqual(thread);
  });

  it("switchAgentThreadMode returns null data when parse fails", async () => {
    routeClientMock.PATCH.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentThreadModePatchResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await switchAgentThreadMode(new Request("http://web.test"), {
      threadId: "thread_1",
      executionMode: "cloud"
    });

    expect(result.data).toBeNull();
  });

  it("startAgentTurn maps parsed turn and normalizes missing output text to null", async () => {
    const turn = { turnId: "turn_1", threadId: "thread_1", status: "started" };

    routeClientMock.POST.mockResolvedValue(makeResult(202, { raw: true }));
    contractSchemaMocks.AgentTurnStartResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { turn }
    });

    const result = await startAgentTurn(new Request("http://web.test"), {
      threadId: "thread_1",
      text: "hello",
      executionMode: "cloud",
      clientRequestId: "req_1"
    });

    expect(routeClientMock.POST).toHaveBeenCalledWith("/v1/agent/threads/{threadId}/turns", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        }
      },
      body: {
        text: "hello",
        executionMode: "cloud",
        clientRequestId: "req_1"
      }
    });
    expect(result.data).toEqual({
      ...turn,
      outputText: null
    });
  });

  it("startAgentTurn returns null data when parse fails", async () => {
    routeClientMock.POST.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentTurnStartResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await startAgentTurn(new Request("http://web.test"), {
      threadId: "thread_1",
      text: "hello"
    });

    expect(result.data).toBeNull();
  });

  it("interruptAgentTurn maps parsed turn and always nulls output text", async () => {
    const turn = {
      turnId: "turn_1",
      threadId: "thread_1",
      status: "interrupted",
      outputText: "should-not-survive"
    };

    routeClientMock.POST.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentTurnInterruptResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { turn }
    });

    const result = await interruptAgentTurn(new Request("http://web.test"), {
      threadId: "thread_1",
      turnId: "turn_1"
    });

    expect(routeClientMock.POST).toHaveBeenCalledWith(
      "/v1/agent/threads/{threadId}/turns/{turnId}/interrupt",
      {
        credentials: "include",
        params: {
          path: {
            threadId: "thread_1",
            turnId: "turn_1"
          }
        }
      }
    );
    expect(result.data).toEqual({
      ...turn,
      outputText: null
    });
  });

  it("interruptAgentTurn returns null data when parse fails", async () => {
    routeClientMock.POST.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentTurnInterruptResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await interruptAgentTurn(new Request("http://web.test"), {
      threadId: "thread_1",
      turnId: "turn_1"
    });

    expect(result.data).toBeNull();
  });

  it("listAgentThreadEvents maps parsed events and computes max cursor", async () => {
    const events = [{ cursor: 3 }, { cursor: 7 }, { cursor: 5 }];

    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentEventsListResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { events }
    });

    const result = await listAgentThreadEvents(new Request("http://web.test"), {
      threadId: "thread_1"
    });

    expect(routeClientMock.GET).toHaveBeenCalledWith("/v1/agent/threads/{threadId}/events", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        },
        query: {
          cursor: 0,
          limit: 300
        }
      }
    });
    expect(result.data).toEqual({
      events,
      nextCursor: 7
    });
  });

  it("listAgentThreadEvents returns null data when parse fails", async () => {
    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentEventsListResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await listAgentThreadEvents(new Request("http://web.test"), {
      threadId: "thread_1",
      cursor: 9,
      limit: 2
    });

    expect(result.data).toBeNull();
  });

  it("listAgentThreadEventsClient maps parsed events and computes next cursor", async () => {
    const events = [{ cursor: 4 }, { cursor: 8 }, { cursor: 6 }];

    browserClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentEventsListResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { events }
    });

    const result = await listAgentThreadEventsClient({
      threadId: "thread_1",
      baseUrl: "http://web.test"
    });

    expect(browserClientMock.GET).toHaveBeenCalledWith("/v1/agent/threads/{threadId}/events", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        },
        query: {
          cursor: 0,
          limit: 200
        }
      }
    });
    expect(result).toEqual({
      events,
      nextCursor: 8
    });
  });

  it("listAgentThreadEventsClient falls back to empty result when parse fails", async () => {
    browserClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.AgentEventsListResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await listAgentThreadEventsClient({
      threadId: "thread_1",
      cursor: 10,
      limit: 1,
      baseUrl: "http://web.test"
    });

    expect(result).toEqual({
      events: [],
      nextCursor: 0
    });
  });

  it("appendAgentThreadEventsBatchClient returns accepted count from parsed response", async () => {
    browserClientMock.POST.mockResolvedValue(makeResult(202, { raw: true }));
    contractSchemaMocks.AgentEventsBatchResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { accepted: 3 }
    });

    const events = [{ method: "runtime.customEvent", payload: { ok: true } }];
    const result = await appendAgentThreadEventsBatchClient({
      threadId: "thread_1",
      events,
      baseUrl: "http://web.test"
    });

    expect(browserClientMock.POST).toHaveBeenCalledWith(
      "/v1/agent/threads/{threadId}/events:batch",
      {
        credentials: "include",
        params: {
          path: {
            threadId: "thread_1"
          }
        },
        body: {
          events
        }
      }
    );
    expect(result).toEqual({ accepted: 3 });
  });

  it("appendAgentThreadEventsBatchClient falls back to accepted=0 when parse fails", async () => {
    browserClientMock.POST.mockResolvedValue(makeResult(202, { raw: true }));
    contractSchemaMocks.AgentEventsBatchResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await appendAgentThreadEventsBatchClient({
      threadId: "thread_1",
      events: [{ method: "runtime.customEvent", payload: {} }],
      baseUrl: "http://web.test"
    });

    expect(result).toEqual({ accepted: 0 });
  });

  it("parseStreamEventPayload returns parsed event", () => {
    const event = {
      cursor: 1,
      threadId: "thread_1",
      turnId: "turn_1",
      method: "turn.started",
      payload: { text: "hello" },
      createdAt: "2026-01-01T00:00:00.000Z"
    };

    contractSchemaMocks.AgentEventSchema.safeParse.mockReturnValue({
      success: true,
      data: event
    });

    expect(parseStreamEventPayload({ raw: true })).toEqual(event);
  });

  it("parseStreamEventPayload returns null when parse fails", () => {
    contractSchemaMocks.AgentEventSchema.safeParse.mockReturnValue({
      success: false
    });

    expect(parseStreamEventPayload({ invalid: true })).toBeNull();
  });
});
