import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatThreadComposer } from "~/features/chat/presentation/chat-thread-composer";

afterEach(() => {
  cleanup();
});

vi.mock("@assistant-ui/react", () => ({
  ComposerPrimitive: {
    Root: (props: ComponentProps<"div">) => <div {...props} />,
    Input: (props: ComponentProps<"textarea">) => <textarea {...props} />,
    Send: (props: { children: ReactNode }) => <>{props.children}</>,
    Cancel: (props: { children: ReactNode }) => <>{props.children}</>
  },
  ThreadPrimitive: {
    If: (props: { children: ReactNode }) => <>{props.children}</>
  }
}));

describe("chat thread composer", () => {
  it("renders a send action with the current surface status when idle", () => {
    render(
      <ChatThreadComposer
        canCancel={false}
        isBusy={false}
        surfaceState={{
          executionLabel: "Local runtime",
          transportLifecycle: "open",
          transportLabel: "Live updates connected",
          actionError: null,
          transportError: null,
          activityLabel: null,
          isPending: false
        }}
      />
    );

    expect(screen.getByRole("status").textContent).toContain("Live updates connected");
    expect(screen.getByText("Local runtime")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send prompt" })).toBeTruthy();
  });

  it("renders a busy indicator while a submission is pending and no turn can be cancelled yet", () => {
    render(
      <ChatThreadComposer
        canCancel={false}
        isBusy
        surfaceState={{
          executionLabel: "Cloud runtime",
          transportLifecycle: "connecting",
          transportLabel: "Syncing this thread…",
          actionError: null,
          transportError: null,
          activityLabel: "Sending to the cloud runtime…",
          isPending: true
        }}
      />
    );

    expect(screen.getAllByRole("status").at(-1)?.textContent).toContain(
      "Sending to the cloud runtime…"
    );
    expect(screen.getByRole("button", { name: "Submitting prompt" }).getAttribute("disabled")).toBe(
      ""
    );
  });

  it("surfaces errors and shows interrupt while a turn is active", () => {
    render(
      <ChatThreadComposer
        canCancel
        isBusy
        surfaceState={{
          executionLabel: "Cloud runtime",
          transportLifecycle: "error",
          transportLabel: "Live updates unavailable",
          actionError: "Send failed",
          transportError: null,
          activityLabel: null,
          isPending: true
        }}
      />
    );

    expect(screen.getByRole("alert").textContent).toContain("Send failed");
    expect(screen.getByRole("button", { name: "Interrupt active turn" })).toBeTruthy();
  });
});
