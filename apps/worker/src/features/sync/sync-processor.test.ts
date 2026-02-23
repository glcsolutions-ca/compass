import { describe, expect, it } from "vitest";
import { InMemoryIdempotencyStore, processSyncMessage } from "./sync-processor.js";

describe("processSyncMessage", () => {
  it("marks successfully processed messages as idempotent", () => {
    const store = new InMemoryIdempotencyStore();
    const message = {
      id: "evt-1",
      eventType: "system.ping",
      source: "test-suite",
      occurredAt: "2026-02-21T00:00:00.000Z",
      attempt: 0,
      payload: { ok: true }
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
        id: "evt-2",
        eventType: "system.ping",
        source: "test-suite",
        occurredAt: "2026-02-21T00:00:00.000Z",
        attempt: 5,
        payload: null
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
        id: "evt-3",
        eventType: "system.ping",
        source: "test-suite",
        occurredAt: "2026-02-21T00:00:00.000Z",
        attempt: 1,
        payload: null
      },
      store,
      { shouldFailTransiently: () => true }
    );

    expect(result.status).toBe("retry");
  });
});
