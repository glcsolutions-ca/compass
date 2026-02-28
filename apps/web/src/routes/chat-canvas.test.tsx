import {
  type ExternalStoreAdapter,
  type ThreadMessageLike,
  useExternalStoreRuntime
} from "@assistant-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useMemo, useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { ChatCanvas } from "~/features/chat/presentation/chat-canvas";
import {
  type AssistantEventPartModel,
  convertAssistantStoreMessage
} from "~/features/chat/presentation/chat-runtime-store";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver !== "undefined") {
    if (typeof HTMLElement.prototype.scrollTo !== "function") {
      HTMLElement.prototype.scrollTo = () => undefined;
    }
    return;
  }

  class ResizeObserverMock implements ResizeObserver {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
  }

  globalThis.ResizeObserver = ResizeObserverMock;

  if (typeof HTMLElement.prototype.scrollTo !== "function") {
    HTMLElement.prototype.scrollTo = () => undefined;
  }
});

function ChatCanvasHarness() {
  const store = useMemo<ExternalStoreAdapter>(
    () => ({
      isRunning: false,
      messages: [],
      onNew: async (_message) => undefined
    }),
    []
  );
  const runtime = useExternalStoreRuntime(store);

  return (
    <ChatCanvas
      executionMode="cloud"
      localModeAvailable={false}
      onExecutionModeChange={() => undefined}
      runtime={runtime}
      surfaceState={{
        transportLifecycle: "open",
        transportLabel: "Live",
        actionError: null,
        transportError: null
      }}
      switchingMode={false}
    />
  );
}

function ChatCanvasInteractiveHarness() {
  const [messages, setMessages] = useState<ThreadMessageLike[]>(() => [
    convertAssistantStoreMessage({
      id: "assistant-event-1",
      role: "assistant",
      text: "Turn started",
      turnId: "turn-1",
      cursor: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      streaming: false,
      eventPart: {
        kind: "status",
        label: "Turn started",
        detail: null,
        cursor: 1,
        defaultTab: "activity"
      } satisfies AssistantEventPartModel
    }),
    convertAssistantStoreMessage({
      id: "assistant-text-1",
      role: "assistant",
      text: "Plain assistant reply",
      turnId: "turn-1",
      cursor: 2,
      createdAt: "2026-01-01T00:00:00.100Z",
      streaming: false,
      eventPart: null
    })
  ]);

  const store = useMemo<ExternalStoreAdapter>(
    () => ({
      isRunning: false,
      messages,
      onNew: async (message) => {
        const prompt = message.content
          .map((part) => {
            if (part.type === "text" || part.type === "reasoning") {
              return part.text;
            }
            return "";
          })
          .join("\n")
          .trim();

        if (!prompt) {
          return;
        }

        setMessages((current) => [
          ...current,
          convertAssistantStoreMessage({
            id: `user-${current.length.toString()}`,
            role: "user",
            text: prompt,
            turnId: null,
            cursor: null,
            createdAt: new Date().toISOString(),
            streaming: false,
            eventPart: null
          })
        ]);
      }
    }),
    [messages]
  );

  const runtime = useExternalStoreRuntime(store);

  return (
    <ChatCanvas
      executionMode="cloud"
      localModeAvailable={false}
      onExecutionModeChange={() => undefined}
      runtime={runtime}
      surfaceState={{
        transportLifecycle: "open",
        transportLabel: "Live",
        actionError: null,
        transportError: null
      }}
      switchingMode={false}
    />
  );
}

function ChatCanvasMultipartAssistantHarness() {
  const store = useMemo<ExternalStoreAdapter>(
    () => ({
      isRunning: false,
      messages: [
        {
          id: "assistant-multipart",
          role: "assistant",
          content: [
            {
              type: "text",
              text: "First assistant part"
            },
            {
              type: "text",
              text: "Second assistant part"
            }
          ],
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          status: {
            type: "complete",
            reason: "stop"
          },
          metadata: {}
        } satisfies ThreadMessageLike
      ],
      onNew: async (_message) => undefined
    }),
    []
  );
  const runtime = useExternalStoreRuntime(store);

  return (
    <ChatCanvas
      executionMode="cloud"
      localModeAvailable={false}
      onExecutionModeChange={() => undefined}
      runtime={runtime}
      surfaceState={{
        transportLifecycle: "open",
        transportLabel: "Live",
        actionError: null,
        transportError: null
      }}
      switchingMode={false}
    />
  );
}

describe("chat canvas", () => {
  it("renders welcome state without crashing on empty runtime", () => {
    render(<ChatCanvasHarness />);
    expect(screen.queryByText("What's on the agenda today?")).not.toBeNull();
  });

  it("supports type-and-send flow without runtime index errors", async () => {
    render(<ChatCanvasInteractiveHarness />);

    expect(screen.queryByText("Turn started")).not.toBeNull();
    expect(screen.queryByText("Plain assistant reply")).not.toBeNull();

    const input = screen.getAllByPlaceholderText("Ask Compass anything...").at(-1);
    const sendButton = screen.getAllByLabelText("Send prompt").at(-1);
    expect(input).toBeDefined();
    expect(sendButton).toBeDefined();

    if (!input || !sendButton) {
      throw new Error("Composer controls not available");
    }

    fireEvent.change(input, { target: { value: "Investigate this bug" } });
    fireEvent.click(sendButton);

    expect(await screen.findByText("Investigate this bug")).not.toBeNull();
  });

  it("renders multi-part assistant text without lookup index errors", () => {
    render(<ChatCanvasMultipartAssistantHarness />);

    expect(screen.queryByText("First assistant part")).not.toBeNull();
    expect(screen.queryByText("Second assistant part")).not.toBeNull();
  });
});
