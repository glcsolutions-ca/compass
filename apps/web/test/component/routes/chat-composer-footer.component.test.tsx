import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChatComposerFooter } from "~/features/chat/presentation/chat-composer-footer";

let threadRunning = false;

vi.mock("@assistant-ui/react", () => ({
  ComposerPrimitive: {
    Root: (props: ComponentProps<"div">) => <div {...props} />,
    Input: (props: ComponentProps<"textarea">) => <textarea {...props} />,
    Send: (props: { children: ReactNode }) => <>{props.children}</>,
    Cancel: (props: { children: ReactNode }) => <>{props.children}</>
  },
  ThreadPrimitive: {
    If: (props: { running: boolean; children: ReactNode }) =>
      props.running === threadRunning ? <>{props.children}</> : null
  }
}));

describe("chat composer footer", () => {
  it("renders send mode with status text and switches execution mode", () => {
    threadRunning = false;
    const onExecutionModeChange = vi.fn();

    render(
      <ChatComposerFooter
        executionMode="cloud"
        localModeAvailable
        onExecutionModeChange={onExecutionModeChange}
        surfaceState={{
          transportLifecycle: "open",
          transportLabel: "Live",
          actionError: null,
          transportError: null
        }}
        switchingMode={false}
      />
    );

    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send prompt" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Mode"), {
      target: { value: "local" }
    });
    expect(onExecutionModeChange).toHaveBeenCalledWith("local");
  });

  it("renders interrupt mode and error status when thread is running", () => {
    threadRunning = true;

    render(
      <ChatComposerFooter
        executionMode="local"
        localModeAvailable={false}
        onExecutionModeChange={vi.fn()}
        surfaceState={{
          transportLifecycle: "error",
          transportLabel: "Disconnected",
          actionError: "Send failed",
          transportError: null
        }}
        switchingMode
      />
    );

    expect(screen.getByRole("alert").textContent).toContain("Send failed");
    expect(screen.getByRole("button", { name: "Interrupt active turn" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Local (coming soon)" })).toBeTruthy();
  });
});
