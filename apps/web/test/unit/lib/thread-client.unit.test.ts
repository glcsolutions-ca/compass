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
  ThreadEventSchema: { safeParse: vi.fn() },
  ThreadEventsBatchResponseSchema: { safeParse: vi.fn() },
  ThreadEventsListResponseSchema: { safeParse: vi.fn() },
  ThreadCreateResponseSchema: { safeParse: vi.fn() },
  ThreadDeleteResponseSchema: { safeParse: vi.fn() },
  ThreadListResponseSchema: { safeParse: vi.fn() },
  ThreadModePatchResponseSchema: { safeParse: vi.fn() },
  ThreadPatchResponseSchema: { safeParse: vi.fn() },
  ThreadReadResponseSchema: { safeParse: vi.fn() },
  TurnInterruptResponseSchema: { safeParse: vi.fn() },
  TurnStartResponseSchema: { safeParse: vi.fn() }
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
  appendChatThreadEventsBatchClient,
  createChatThread,
  deleteChatThreadClient,
  getChatThread,
  interruptChatTurn,
  listChatThreadEvents,
  listChatThreadEventsClient,
  listChatThreads,
  listChatThreadsClient,
  parseThreadStreamEventPayload,
  patchChatThreadClient,
  startChatTurn,
  switchChatThreadMode
} from "~/features/chat/thread-client";

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

  it("createChatThread maps parsed thread payload", async () => {
    const thread = { threadId: "thread_1", title: "Hello" };
    const rawError = { code: "non-fatal" };

    routeClientMock.POST.mockResolvedValue(makeResult(201, { raw: true }, rawError));
    contractSchemaMocks.ThreadCreateResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { thread }
    });

    const result = await createChatThread(new Request("http://web.test"), {
      workspaceSlug: "ws_1",
      executionMode: "cloud",
      title: "Hello"
    });

    expect(routeClientMock.POST).toHaveBeenCalledWith("/v1/threads", {
      credentials: "include",
      body: {
        workspaceSlug: "ws_1",
        executionMode: "cloud",
        title: "Hello"
      }
    });
    expect(contractSchemaMocks.ThreadCreateResponseSchema.safeParse).toHaveBeenCalledWith({
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

  it("createChatThread returns null data when parse fails", async () => {
    routeClientMock.POST.mockResolvedValue(makeResult(201, { invalid: true }));
    contractSchemaMocks.ThreadCreateResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await createChatThread(new Request("http://web.test"), {
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

  it("listChatThreads maps parsed threads payload", async () => {
    const threads = [{ threadId: "thread_1" }, { threadId: "thread_2" }];

    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadListResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { threads }
    });

    const result = await listChatThreads(new Request("http://web.test"), {
      workspaceSlug: "ws_1",
      state: "archived",
      limit: 10
    });

    expect(routeClientMock.GET).toHaveBeenCalledWith("/v1/threads", {
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

  it("listChatThreads returns null data when parse fails", async () => {
    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadListResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await listChatThreads(new Request("http://web.test"), {
      workspaceSlug: "ws_1"
    });

    expect(result.data).toBeNull();
  });

  it("listChatThreadsClient returns parsed threads", async () => {
    const threads = [{ threadId: "thread_1" }];

    browserClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadListResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { threads }
    });

    const result = await listChatThreadsClient({
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
    expect(browserClientMock.GET).toHaveBeenCalledWith("/v1/threads", {
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

  it("listChatThreadsClient falls back to [] when parse fails", async () => {
    browserClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadListResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await listChatThreadsClient({
      workspaceSlug: "ws_1",
      baseUrl: "http://web.test"
    });

    expect(result).toEqual([]);
  });

  it("getChatThread maps parsed thread payload", async () => {
    const thread = { threadId: "thread_1", title: "Title" };

    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadReadResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { thread }
    });

    const result = await getChatThread(new Request("http://web.test"), "thread_1");

    expect(routeClientMock.GET).toHaveBeenCalledWith("/v1/threads/{threadId}", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        }
      }
    });
    expect(result.data).toEqual(thread);
  });

  it("getChatThread returns null data when parse fails", async () => {
    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadReadResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await getChatThread(new Request("http://web.test"), "thread_1");

    expect(result.data).toBeNull();
  });

  it("patchChatThreadClient returns parsed thread", async () => {
    const thread = { threadId: "thread_1", title: "Renamed" };

    browserClientMock.PATCH.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadPatchResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { thread }
    });

    const result = await patchChatThreadClient({
      threadId: "thread_1",
      title: "Renamed",
      archived: true,
      baseUrl: "http://web.test"
    });

    expect(browserClientMock.PATCH).toHaveBeenCalledWith("/v1/threads/{threadId}", {
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

  it("patchChatThreadClient throws when parse fails", async () => {
    browserClientMock.PATCH.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadPatchResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    await expect(
      patchChatThreadClient({ threadId: "thread_1", baseUrl: "http://web.test" })
    ).rejects.toThrow("Unable to update chat thread.");
  });

  it("deleteChatThreadClient returns parsed delete payload", async () => {
    browserClientMock.DELETE.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadDeleteResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { deleted: true }
    });

    const result = await deleteChatThreadClient({
      threadId: "thread_1",
      baseUrl: "http://web.test"
    });

    expect(browserClientMock.DELETE).toHaveBeenCalledWith("/v1/threads/{threadId}", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        }
      }
    });
    expect(result).toEqual({ deleted: true });
  });

  it("deleteChatThreadClient throws when parse fails", async () => {
    browserClientMock.DELETE.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadDeleteResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    await expect(
      deleteChatThreadClient({ threadId: "thread_1", baseUrl: "http://web.test" })
    ).rejects.toThrow("Unable to delete chat thread.");
  });

  it("switchChatThreadMode maps parsed thread payload", async () => {
    const thread = { threadId: "thread_1", executionMode: "local" };

    routeClientMock.PATCH.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadModePatchResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { thread }
    });

    const result = await switchChatThreadMode(new Request("http://web.test"), {
      threadId: "thread_1",
      executionMode: "local"
    });

    expect(routeClientMock.PATCH).toHaveBeenCalledWith("/v1/threads/{threadId}/mode", {
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

  it("switchChatThreadMode returns null data when parse fails", async () => {
    routeClientMock.PATCH.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadModePatchResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await switchChatThreadMode(new Request("http://web.test"), {
      threadId: "thread_1",
      executionMode: "cloud"
    });

    expect(result.data).toBeNull();
  });

  it("startChatTurn maps parsed turn and normalizes missing output text to null", async () => {
    const turn = { turnId: "turn_1", threadId: "thread_1", status: "started" };

    routeClientMock.POST.mockResolvedValue(makeResult(202, { raw: true }));
    contractSchemaMocks.TurnStartResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { turn }
    });

    const result = await startChatTurn(new Request("http://web.test"), {
      threadId: "thread_1",
      text: "hello",
      executionMode: "cloud",
      clientRequestId: "req_1"
    });

    expect(routeClientMock.POST).toHaveBeenCalledWith("/v1/threads/{threadId}/turns", {
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

  it("startChatTurn returns null data when parse fails", async () => {
    routeClientMock.POST.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.TurnStartResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await startChatTurn(new Request("http://web.test"), {
      threadId: "thread_1",
      text: "hello"
    });

    expect(result.data).toBeNull();
  });

  it("interruptChatTurn maps parsed turn and always nulls output text", async () => {
    const turn = {
      turnId: "turn_1",
      threadId: "thread_1",
      status: "interrupted",
      outputText: "should-not-survive"
    };

    routeClientMock.POST.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.TurnInterruptResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { turn }
    });

    const result = await interruptChatTurn(new Request("http://web.test"), {
      threadId: "thread_1",
      turnId: "turn_1"
    });

    expect(routeClientMock.POST).toHaveBeenCalledWith(
      "/v1/threads/{threadId}/turns/{turnId}/interrupt",
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

  it("interruptChatTurn returns null data when parse fails", async () => {
    routeClientMock.POST.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.TurnInterruptResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await interruptChatTurn(new Request("http://web.test"), {
      threadId: "thread_1",
      turnId: "turn_1"
    });

    expect(result.data).toBeNull();
  });

  it("listChatThreadEvents maps parsed events and computes max cursor", async () => {
    const events = [{ cursor: 3 }, { cursor: 7 }, { cursor: 5 }];

    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadEventsListResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { events }
    });

    const result = await listChatThreadEvents(new Request("http://web.test"), {
      threadId: "thread_1"
    });

    expect(routeClientMock.GET).toHaveBeenCalledWith("/v1/threads/{threadId}/events", {
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

  it("listChatThreadEvents returns null data when parse fails", async () => {
    routeClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadEventsListResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await listChatThreadEvents(new Request("http://web.test"), {
      threadId: "thread_1",
      cursor: 9,
      limit: 2
    });

    expect(result.data).toBeNull();
  });

  it("listChatThreadEventsClient maps parsed events and computes next cursor", async () => {
    const events = [{ cursor: 4 }, { cursor: 8 }, { cursor: 6 }];

    browserClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadEventsListResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { events }
    });

    const result = await listChatThreadEventsClient({
      threadId: "thread_1",
      baseUrl: "http://web.test"
    });

    expect(browserClientMock.GET).toHaveBeenCalledWith("/v1/threads/{threadId}/events", {
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

  it("listChatThreadEventsClient falls back to empty result when parse fails", async () => {
    browserClientMock.GET.mockResolvedValue(makeResult(200, { raw: true }));
    contractSchemaMocks.ThreadEventsListResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await listChatThreadEventsClient({
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

  it("appendChatThreadEventsBatchClient returns accepted count from parsed response", async () => {
    browserClientMock.POST.mockResolvedValue(makeResult(202, { raw: true }));
    contractSchemaMocks.ThreadEventsBatchResponseSchema.safeParse.mockReturnValue({
      success: true,
      data: { accepted: 3 }
    });

    const events = [{ method: "runtime.customEvent", payload: { ok: true } }];
    const result = await appendChatThreadEventsBatchClient({
      threadId: "thread_1",
      events,
      baseUrl: "http://web.test"
    });

    expect(browserClientMock.POST).toHaveBeenCalledWith("/v1/threads/{threadId}/events:batch", {
      credentials: "include",
      params: {
        path: {
          threadId: "thread_1"
        }
      },
      body: {
        events
      }
    });
    expect(result).toEqual({ accepted: 3 });
  });

  it("appendChatThreadEventsBatchClient falls back to accepted=0 when parse fails", async () => {
    browserClientMock.POST.mockResolvedValue(makeResult(202, { raw: true }));
    contractSchemaMocks.ThreadEventsBatchResponseSchema.safeParse.mockReturnValue({
      success: false
    });

    const result = await appendChatThreadEventsBatchClient({
      threadId: "thread_1",
      events: [{ method: "runtime.customEvent", payload: {} }],
      baseUrl: "http://web.test"
    });

    expect(result).toEqual({ accepted: 0 });
  });

  it("parseThreadStreamEventPayload returns parsed event", () => {
    const event = {
      cursor: 1,
      threadId: "thread_1",
      turnId: "turn_1",
      method: "turn.started",
      payload: { text: "hello" },
      createdAt: "2026-01-01T00:00:00.000Z"
    };

    contractSchemaMocks.ThreadEventSchema.safeParse.mockReturnValue({
      success: true,
      data: event
    });

    expect(parseThreadStreamEventPayload({ raw: true })).toEqual(event);
  });

  it("parseThreadStreamEventPayload returns null when parse fails", () => {
    contractSchemaMocks.ThreadEventSchema.safeParse.mockReturnValue({
      success: false
    });

    expect(parseThreadStreamEventPayload({ invalid: true })).toBeNull();
  });
});
