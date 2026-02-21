import { describe, expect, it } from "vitest";
import { InMemoryIdempotencyStore, processSyncMessage } from "./sync-processor.js";

describe("processSyncMessage", () => {
  it("marks successfully processed messages as idempotent", () => {
    const store = new InMemoryIdempotencyStore();
    const message = {
      id: "msg-1",
      employeeId: "employee-123",
      sourceSystem: "jira",
      occurredAt: "2026-02-21T00:00:00.000Z",
      attempt: 0
    };

    const first = processSyncMessage(message, store);
    const second = processSyncMessage(message, store);

    expect(first.status).toBe("processed");
    expect(second.status).toBe("duplicate");
  });

  it("returns dead-letter when message exceeds max attempts", () => {
    const store = new InMemoryIdempotencyStore();
    const result = processSyncMessage(
      {
        id: "msg-2",
        employeeId: "employee-123",
        sourceSystem: "legacy-erp",
        occurredAt: "2026-02-21T00:00:00.000Z",
        attempt: 5
      },
      store,
      { maxAttempts: 5 }
    );

    expect(result.status).toBe("dead-letter");
  });

  it("returns retry for transient failures below attempt threshold", () => {
    const store = new InMemoryIdempotencyStore();
    const result = processSyncMessage(
      {
        id: "msg-3",
        employeeId: "employee-123",
        sourceSystem: "jira",
        occurredAt: "2026-02-21T00:00:00.000Z",
        attempt: 1
      },
      store,
      { shouldFailTransiently: () => true }
    );

    expect(result.status).toBe("retry");
  });
});
