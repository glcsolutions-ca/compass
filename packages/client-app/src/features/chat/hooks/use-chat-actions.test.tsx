import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendMessage } from "@assistant-ui/react";
import type { ChatExecutionMode } from "~/features/chat/thread-types";
import type { ChatActionData } from "~/features/chat/chat-action";
import { __private__, useChatActions } from "~/features/chat/hooks/use-chat-actions";

const useFetcherMock = vi.hoisted(() => vi.fn());
const useNavigateMock = vi.hoisted(() => vi.fn());
const readAppendMessagePromptMock = vi.hoisted(() => vi.fn());
const upsertChatThreadHistoryItemMock = vi.hoisted(() => vi.fn());
const buildThreadHrefMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", () => ({
  useFetcher: useFetcherMock,
  useNavigate: useNavigateMock
}));

vi.mock("~/features/chat/hooks/chat-compose-utils", () => ({
  readAppendMessagePrompt: readAppendMessagePromptMock
}));

vi.mock("~/features/chat/chat-thread-history", () => ({
  upsertChatThreadHistoryItem: upsertChatThreadHistoryItemMock
}));

vi.mock("~/features/chat/new-thread-routing", () => ({
  buildThreadHref: buildThreadHrefMock
}));

type MockFetcher = {
  state: "idle" | "submitting" | "loading";
  data: Partial<ChatActionData> | undefined;
  submit: ReturnType<typeof vi.fn>;
};

function createFetcher(overrides: Partial<MockFetcher> = {}): MockFetcher {
  return {
    state: "idle",
    data: undefined,
    submit: vi.fn(),
    ...overrides
  };
}

function readSubmitCall(
  submitMock: ReturnType<typeof vi.fn>,
  callIndex = 0
): {
  fields: Record<string, FormDataEntryValue>;
  options: { method: string };
} {
  const call = submitMock.mock.calls[callIndex];
  if (!call) {
    throw new Error(`Missing submit call at index ${callIndex}`);
  }
  const [formData, options] = call as [FormData, { method: string }];
  return {
    fields: Object.fromEntries(formData.entries()),
    options
  };
}

function createAppendMessage(overrides: Record<string, unknown> = {}): AppendMessage {
  return {
    role: "user",
    content: [],
    ...overrides
  } as unknown as AppendMessage;
}

function renderChatActions(options?: {
  loaderThreadId?: string | null;
  executionMode?: ChatExecutionMode;
  submitState?: MockFetcher["state"];
  submitData?: Partial<ChatActionData>;
  modeState?: MockFetcher["state"];
  modeData?: Partial<ChatActionData>;
  interruptState?: MockFetcher["state"];
  interruptData?: Partial<ChatActionData>;
}) {
  const submitFetcher = createFetcher({
    state: options?.submitState ?? "idle",
    data: options?.submitData
  });
  const modeFetcher = createFetcher({
    state: options?.modeState ?? "idle",
    data: options?.modeData
  });
  const interruptFetcher = createFetcher({
    state: options?.interruptState ?? "idle",
    data: options?.interruptData
  });
  const fetchers = [submitFetcher, modeFetcher, interruptFetcher];
  let fetcherCallCount = 0;
  useFetcherMock.mockImplementation(() => {
    const fetcher = fetchers[fetcherCallCount % fetchers.length];
    fetcherCallCount += 1;
    return fetcher;
  });

  const navigate = vi.fn();
  const onExecutionModeChange = vi.fn();
  useNavigateMock.mockReturnValue(navigate);

  const loaderThreadId =
    options?.loaderThreadId === undefined ? "thread-active" : options.loaderThreadId;
  let currentProps = {
    loaderThreadId,
    executionMode: options?.executionMode ?? "cloud"
  };

  const hook = renderHook(
    (props: typeof currentProps) =>
      useChatActions({
        workspaceSlug: "workspace-a",
        loaderThreadId: props.loaderThreadId,
        executionMode: props.executionMode,
        onExecutionModeChange
      }),
    {
      initialProps: currentProps
    }
  );

  return {
    result: hook.result,
    submitFetcher,
    modeFetcher,
    interruptFetcher,
    navigate,
    onExecutionModeChange,
    rerender: (next?: Partial<typeof currentProps>) => {
      currentProps = {
        ...currentProps,
        ...next
      };
      hook.rerender(currentProps);
    }
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  buildThreadHrefMock.mockReturnValue("/w/workspace-a/chat/thread-new");
});

describe("resolveActiveThreadId", () => {
  it("prefers loader thread id over stale submit result thread id", () => {
    const resolved = __private__.resolveActiveThreadId({
      loaderThreadId: "thread-current",
      submitResultThreadId: "thread-stale"
    });

    expect(resolved).toBe("thread-current");
  });

  it("uses submit result thread id when loader thread id is missing", () => {
    const resolved = __private__.resolveActiveThreadId({
      loaderThreadId: null,
      submitResultThreadId: "thread-created"
    });

    expect(resolved).toBe("thread-created");
  });

  it("returns null when neither source provides a thread id", () => {
    const resolved = __private__.resolveActiveThreadId({
      loaderThreadId: null,
      submitResultThreadId: null
    });

    expect(resolved).toBeNull();
  });
});

describe("useChatActions", () => {
  it("submits send intent with a trimmed prompt", async () => {
    readAppendMessagePromptMock.mockReturnValue("  hello world  ");
    const { result, submitFetcher } = renderChatActions();

    await act(async () => {
      await result.current.handleAssistantSend(createAppendMessage());
    });

    expect(submitFetcher.submit).toHaveBeenCalledTimes(1);
    const call = readSubmitCall(submitFetcher.submit);
    expect(call.options).toEqual({ method: "post" });
    expect(call.fields.intent).toBe("sendMessage");
    expect(call.fields.threadId).toBe("thread-active");
    expect(call.fields.executionMode).toBe("cloud");
    expect(call.fields.prompt).toBe("hello world");
    expect(typeof call.fields.clientRequestId).toBe("string");
  });

  it("does not submit send intent when prompt is missing", async () => {
    readAppendMessagePromptMock.mockReturnValue(null);
    const { result, submitFetcher } = renderChatActions();

    await act(async () => {
      await result.current.handleAssistantSend(createAppendMessage());
    });

    expect(submitFetcher.submit).not.toHaveBeenCalled();
  });

  it("submits edit intent with source and parent message ids", async () => {
    readAppendMessagePromptMock.mockReturnValue(" edit this ");
    const { result, submitFetcher } = renderChatActions();

    await act(async () => {
      await result.current.handleAssistantEdit(
        createAppendMessage({
          sourceId: "msg-source-1",
          parentId: "msg-parent-1"
        })
      );
    });

    expect(submitFetcher.submit).toHaveBeenCalledTimes(1);
    const call = readSubmitCall(submitFetcher.submit);
    expect(call.fields.intent).toBe("editMessage");
    expect(call.fields.prompt).toBe("edit this");
    expect(call.fields.sourceMessageId).toBe("msg-source-1");
    expect(call.fields.parentMessageId).toBe("msg-parent-1");
  });

  it("submits reload intent", async () => {
    const { result, submitFetcher } = renderChatActions();

    await act(async () => {
      await result.current.handleAssistantReload({
        parentId: "msg-parent-2",
        prompt: "  rerun this  "
      });
    });

    expect(submitFetcher.submit).toHaveBeenCalledTimes(1);
    const call = readSubmitCall(submitFetcher.submit);
    expect(call.fields.intent).toBe("reloadMessage");
    expect(call.fields.prompt).toBe("rerun this");
    expect(call.fields.parentMessageId).toBe("msg-parent-2");
  });

  it("queues latest distinct submit while submit fetcher is busy", async () => {
    const { result, submitFetcher, rerender } = renderChatActions({
      submitState: "submitting"
    });

    await act(async () => {
      await result.current.handleAssistantReload({ parentId: "p-1", prompt: "first prompt" });
      await result.current.handleAssistantReload({ parentId: "p-2", prompt: "second prompt" });
    });

    expect(submitFetcher.submit).not.toHaveBeenCalled();

    submitFetcher.state = "idle";
    act(() => {
      rerender();
    });

    expect(submitFetcher.submit).toHaveBeenCalledTimes(1);
    const call = readSubmitCall(submitFetcher.submit);
    expect(call.fields.prompt).toBe("second prompt");
    expect(call.fields.parentMessageId).toBe("p-2");
  });

  it("dedupes identical pending submit intent while busy", async () => {
    const { result, submitFetcher, rerender } = renderChatActions({
      submitState: "submitting"
    });

    await act(async () => {
      await result.current.handleAssistantReload({ parentId: "p-1", prompt: "same prompt" });
      await result.current.handleAssistantReload({ parentId: "p-1", prompt: "same prompt" });
    });

    submitFetcher.state = "idle";
    act(() => {
      rerender();
    });

    expect(submitFetcher.submit).toHaveBeenCalledTimes(1);
  });

  it("dedupes identical in-flight submit intent", async () => {
    const { result, submitFetcher } = renderChatActions();

    await act(async () => {
      await result.current.handleAssistantReload({ parentId: "p-1", prompt: "in flight prompt" });
      await result.current.handleAssistantReload({ parentId: "p-1", prompt: "in flight prompt" });
    });

    expect(submitFetcher.submit).toHaveBeenCalledTimes(1);
  });

  it("switches mode and submits when an active thread exists", () => {
    const { result, modeFetcher, onExecutionModeChange } = renderChatActions({
      loaderThreadId: "thread-abc"
    });

    act(() => {
      result.current.handleModeChange("local");
    });

    expect(onExecutionModeChange).toHaveBeenCalledWith("local");
    expect(modeFetcher.submit).toHaveBeenCalledTimes(1);
    const call = readSubmitCall(modeFetcher.submit);
    expect(call.fields.intent).toBe("switchMode");
    expect(call.fields.threadId).toBe("thread-abc");
    expect(call.fields.executionMode).toBe("local");
  });

  it("switches mode locally only when no active thread exists", () => {
    const { result, modeFetcher, onExecutionModeChange } = renderChatActions({
      loaderThreadId: null
    });

    act(() => {
      result.current.handleModeChange("local");
    });

    expect(onExecutionModeChange).toHaveBeenCalledWith("local");
    expect(modeFetcher.submit).not.toHaveBeenCalled();
  });

  it("submits mode switch when active thread comes from submit result", () => {
    const { result, modeFetcher } = renderChatActions({
      loaderThreadId: null,
      submitData: {
        threadId: "thread-created"
      }
    });

    act(() => {
      result.current.handleModeChange("local");
    });

    expect(modeFetcher.submit).toHaveBeenCalledTimes(1);
    const call = readSubmitCall(modeFetcher.submit);
    expect(call.fields.threadId).toBe("thread-created");
  });

  it("submits interrupt when idle and ids are present", () => {
    const { result, interruptFetcher } = renderChatActions({
      loaderThreadId: "thread-xyz",
      interruptState: "idle"
    });

    act(() => {
      result.current.submitInterruptTurn("turn-xyz");
    });

    expect(interruptFetcher.submit).toHaveBeenCalledTimes(1);
    const call = readSubmitCall(interruptFetcher.submit);
    expect(call.fields.intent).toBe("interruptTurn");
    expect(call.fields.threadId).toBe("thread-xyz");
    expect(call.fields.turnId).toBe("turn-xyz");
  });

  it("does not submit interrupt when interrupt fetcher is busy", () => {
    const { result, interruptFetcher } = renderChatActions({
      loaderThreadId: "thread-xyz",
      interruptState: "submitting"
    });

    act(() => {
      result.current.submitInterruptTurn("turn-xyz");
    });

    expect(interruptFetcher.submit).not.toHaveBeenCalled();
  });

  it("does not submit interrupt when thread or turn id is missing", () => {
    const withoutThread = renderChatActions({
      loaderThreadId: null,
      interruptState: "idle"
    });
    act(() => {
      withoutThread.result.current.submitInterruptTurn("turn-xyz");
    });
    expect(withoutThread.interruptFetcher.submit).not.toHaveBeenCalled();

    const withoutTurn = renderChatActions({
      loaderThreadId: "thread-xyz",
      interruptState: "idle"
    });
    act(() => {
      withoutTurn.result.current.submitInterruptTurn(null);
    });
    expect(withoutTurn.interruptFetcher.submit).not.toHaveBeenCalled();
  });

  it("prefers submit error over mode and interrupt errors", () => {
    const { result, submitFetcher, modeFetcher, interruptFetcher, rerender } = renderChatActions();

    submitFetcher.data = { error: "submit failed" };
    modeFetcher.data = { error: "mode failed" };
    interruptFetcher.data = { error: "interrupt failed" };
    act(() => {
      rerender();
    });

    expect(result.current.actionError).toBe("submit failed");
  });

  it("uses mode error when submit error is missing", () => {
    const { result, submitFetcher, modeFetcher, interruptFetcher, rerender } = renderChatActions();

    submitFetcher.data = { error: null };
    modeFetcher.data = { error: "mode failed" };
    interruptFetcher.data = { error: "interrupt failed" };
    act(() => {
      rerender();
    });

    expect(result.current.actionError).toBe("mode failed");
  });

  it("uses interrupt error when submit and mode errors are missing", () => {
    const { result, submitFetcher, modeFetcher, interruptFetcher, rerender } = renderChatActions();

    submitFetcher.data = { error: null };
    modeFetcher.data = { error: null };
    interruptFetcher.data = { error: "interrupt failed" };
    act(() => {
      rerender();
    });

    expect(result.current.actionError).toBe("interrupt failed");
  });
});
