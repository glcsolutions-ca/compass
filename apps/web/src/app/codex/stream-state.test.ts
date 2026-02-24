import { describe, expect, it } from "vitest";
import {
  createStreamState,
  parseStreamEventMessage,
  readApprovalReason,
  reduceStreamEvent
} from "./stream-state.js";

describe("stream-state", () => {
  it("adds and resolves pending approvals", () => {
    const initial = createStreamState();

    const withApproval = reduceStreamEvent(initial, {
      type: "approval.requested",
      requestId: "approval_1",
      payload: {
        reason: "Need approval"
      }
    });

    expect(withApproval.pendingApprovals).toHaveLength(1);
    expect(withApproval.pendingApprovals[0]?.requestId).toBe("approval_1");

    const resolved = reduceStreamEvent(withApproval, {
      type: "approval.resolved",
      requestId: "approval_1",
      payload: {
        decision: "accept"
      }
    });

    expect(resolved.pendingApprovals).toHaveLength(0);
  });

  it("deduplicates repeated approval request ids", () => {
    const initial = createStreamState();
    const first = reduceStreamEvent(initial, {
      type: "approval.requested",
      requestId: "approval_1",
      payload: {
        reason: "first"
      }
    });
    const second = reduceStreamEvent(first, {
      type: "approval.requested",
      requestId: "approval_1",
      payload: {
        reason: "second"
      }
    });

    expect(second.pendingApprovals).toHaveLength(1);
    expect(second.pendingApprovals[0]?.payload.reason).toBe("second");
  });

  it("keeps only the most recent 100 events", () => {
    let state = createStreamState();

    for (let index = 0; index < 120; index += 1) {
      state = reduceStreamEvent(state, {
        type: "item.delta",
        payload: {
          index
        }
      });
    }

    expect(state.events).toHaveLength(100);
    expect((state.events[0]?.payload as { index: number }).index).toBe(20);
  });
});

describe("parseStreamEventMessage", () => {
  it("parses valid stream events", () => {
    const parsed = parseStreamEventMessage(
      JSON.stringify({
        type: "turn.started",
        payload: {
          turnId: "turn_1"
        }
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("turn.started");
  });

  it("rejects invalid payloads", () => {
    expect(parseStreamEventMessage("{invalid")).toBeNull();
    expect(parseStreamEventMessage(JSON.stringify({ type: "unknown", payload: {} }))).toBeNull();
    expect(parseStreamEventMessage(Buffer.from("x"))).toBeNull();
  });
});

describe("readApprovalReason", () => {
  it("returns reason text when present", () => {
    expect(readApprovalReason({ reason: "approve command" })).toBe("approve command");
  });

  it("falls back to default text", () => {
    expect(readApprovalReason({})).toBe("Approval required");
  });
});
