import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatRoute from "~/routes/app/chat/route";

const useLoaderDataMock = vi.hoisted(() => vi.fn());
const useLocationMock = vi.hoisted(() => vi.fn());
const useNavigateMock = vi.hoisted(() => vi.fn());
const useExternalStoreRuntimeMock = vi.hoisted(() => vi.fn());
const useChatActionsMock = vi.hoisted(() => vi.fn());
const useChatTransportMock = vi.hoisted(() => vi.fn());
const useChatTimelineMock = vi.hoisted(() => vi.fn());
const appendAgentThreadEventsBatchClientMock = vi.hoisted(() => vi.fn());

let lastAssistantStore: Record<string, unknown> | null = null;

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useLoaderData: useLoaderDataMock,
    useLocation: useLocationMock,
    useNavigate: useNavigateMock
  };
});

vi.mock("@assistant-ui/react", () => {
  class CompositeAttachmentAdapter {
    constructor(public adapters: unknown[]) {}
  }
  class SimpleImageAttachmentAdapter {}
  class SimpleTextAttachmentAdapter {}
  class WebSpeechSynthesisAdapter {}
  class WebSpeechDictationAdapter {
    static isSupported() {
      return true;
    }

    constructor(public input: unknown) {}
  }

  return {
    CompositeAttachmentAdapter,
    SimpleImageAttachmentAdapter,
    SimpleTextAttachmentAdapter,
    WebSpeechSynthesisAdapter,
    WebSpeechDictationAdapter,
    useExternalStoreRuntime: useExternalStoreRuntimeMock
  };
});

vi.mock("~/features/chat/hooks/use-chat-actions", () => ({
  useChatActions: useChatActionsMock
}));

vi.mock("~/features/chat/hooks/use-chat-transport", () => ({
  useChatTransport: useChatTransportMock
}));

vi.mock("~/features/chat/hooks/use-chat-timeline", () => ({
  useChatTimeline: useChatTimelineMock
}));

vi.mock("~/features/chat/agent-client", () => ({
  appendAgentThreadEventsBatchClient: appendAgentThreadEventsBatchClientMock
}));

vi.mock("~/features/chat/presentation/chat-canvas", () => ({
  ChatCanvas: (props: { runtime: unknown }) => (
    <div data-testid="chat-canvas">
      <button
        onClick={() => {
          void (props.runtime as { onCancel?: () => Promise<void> }).onCancel?.();
        }}
        type="button"
      >
        Canvas cancel
      </button>
    </div>
  )
}));

vi.mock("~/features/chat/presentation/chat-inspect-drawer", async () => {
  const actual = await vi.importActual("~/features/chat/presentation/chat-inspect-drawer");
  return {
    ...actual,
    ChatInspectDrawer: (props: {
      inspectState: { cursor: number | null; tab: string };
      onInspectStateChange: (
        nextState: { cursor: number | null; tab: string },
        options?: {
          replace?: boolean;
        }
      ) => void;
    }) => (
      <div data-testid="chat-inspect-drawer">
        <span>{`${props.inspectState.tab}:${String(props.inspectState.cursor)}`}</span>
        <button
          onClick={() => props.onInspectStateChange({ cursor: 9, tab: "raw" }, { replace: true })}
          type="button"
        >
          Change inspect
        </button>
      </div>
    )
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  lastAssistantStore = null;
  useLoaderDataMock.mockReturnValue({
    workspaceSlug: "personal-user-1",
    threadId: "thread-1",
    executionMode: "cloud",
    initialCursor: 0,
    initialEvents: []
  });
  useLocationMock.mockReturnValue({
    pathname: "/w/personal-user-1/chat/thread-1",
    search: "?inspect=2&inspectTab=activity",
    hash: ""
  });
  useNavigateMock.mockReturnValue(vi.fn());
  useChatActionsMock.mockReturnValue({
    activeThreadId: "thread-1",
    submitFetcher: { data: undefined },
    handleAssistantSend: vi.fn(async () => undefined),
    handleAssistantEdit: vi.fn(async () => undefined),
    handleAssistantReload: vi.fn(async () => undefined),
    submitInterruptTurn: vi.fn()
  });
  useChatTransportMock.mockReturnValue({
    eventState: {
      events: []
    }
  });
  useChatTimelineMock.mockReturnValue({
    activeTurnId: "turn-1",
    assistantMessages: []
  });
  useExternalStoreRuntimeMock.mockImplementation((store: Record<string, unknown>) => {
    lastAssistantStore = store;
    return store;
  });
});

describe("chat route component", () => {
  it("renders chat surfaces and navigates when inspect state changes", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    render(<ChatRoute />);

    expect(screen.getByTestId("chat-canvas")).toBeTruthy();
    expect(screen.getByTestId("chat-inspect-drawer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change inspect" }));

    expect(navigate).toHaveBeenCalledWith(
      {
        pathname: "/w/personal-user-1/chat/thread-1",
        search: "?inspect=9&inspectTab=raw",
        hash: ""
      },
      {
        replace: true
      }
    );
  });

  it("submits feedback events against the active thread", async () => {
    render(<ChatRoute />);
    const store = lastAssistantStore as {
      adapters: {
        feedback: {
          submit: (feedback: {
            message: { id: string; metadata?: { custom?: { turnId?: unknown } } };
            type: "positive" | "negative";
          }) => void;
        };
      };
    } | null;

    expect(store).not.toBeNull();
    if (!store) {
      throw new Error("Missing assistant store");
    }

    store.adapters.feedback.submit({
      message: {
        id: "message-1",
        metadata: {
          custom: {
            turnId: "turn-1"
          }
        }
      },
      type: "positive"
    });

    expect(appendAgentThreadEventsBatchClientMock).toHaveBeenCalledWith({
      threadId: "thread-1",
      events: [
        {
          turnId: "turn-1",
          method: "message.feedback.submitted",
          payload: {
            messageId: "message-1",
            type: "positive"
          }
        }
      ]
    });
  });
});
