import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientAction as chatAction } from "~/routes/app/chat/route";

vi.mock("~/lib/api/compass-client", () => ({
  createAgentThread: vi.fn(async () => ({
    status: 201,
    thread: {
      threadId: "thread-123",
      executionMode: "cloud"
    }
  })),
  getAgentThread: vi.fn(async () => ({
    status: 200,
    thread: {
      threadId: "thread-123",
      executionMode: "cloud"
    }
  })),
  switchAgentThreadMode: vi.fn(async () => ({
    status: 200,
    thread: {
      threadId: "thread-123",
      executionMode: "cloud"
    }
  })),
  startAgentTurn: vi.fn(async () => ({
    status: 200,
    turn: {
      turnId: "turn-123",
      outputText: "Cloud(dynamic_sessions) response: hello"
    }
  })),
  appendAgentEventsBatch: vi.fn(async () => ({ status: 200 }))
}));

describe("chat action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { window?: unknown }).window;
  });

  it("requires a prompt", async () => {
    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      })
    });

    expect(result).toEqual({
      error: "Prompt is required.",
      prompt: null,
      answer: null,
      threadId: null,
      executionMode: "cloud"
    });
  });

  it("returns cloud mode response payload", async () => {
    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "hello");
    formData.set("executionMode", "cloud");
    formData.set("tenantSlug", "acme");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      })
    });

    expect(result).toEqual({
      error: null,
      prompt: "hello",
      answer: "Cloud(dynamic_sessions) response: hello",
      threadId: "thread-123",
      executionMode: "cloud"
    });
  });

  it("rejects local mode when desktop bridge is unavailable", async () => {
    const formData = new FormData();
    formData.set("intent", "sendMessage");
    formData.set("prompt", "hello");
    formData.set("executionMode", "local");
    formData.set("tenantSlug", "acme");

    const result = await chatAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      })
    });

    expect(result).toEqual({
      error: "Local mode is only available in the desktop app.",
      prompt: "hello",
      answer: null,
      threadId: "thread-123",
      executionMode: "local"
    });
  });
});
