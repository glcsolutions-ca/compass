import { describe, expect, it } from "vitest";
import { EventEnvelopeSchema } from "./event-envelope.js";

describe("EventEnvelopeSchema", () => {
  it("parses a valid message", () => {
    const parsed = EventEnvelopeSchema.parse({
      id: "evt-1",
      eventType: "system.ping",
      source: "test-suite",
      occurredAt: "2026-02-21T00:00:00.000Z",
      attempt: 1,
      payload: { ok: true }
    });

    expect(parsed.id).toBe("evt-1");
    expect(parsed.attempt).toBe(1);
  });

  it("applies default attempt value", () => {
    const parsed = EventEnvelopeSchema.parse({
      id: "evt-2",
      eventType: "system.ping",
      source: "test-suite",
      occurredAt: "2026-02-21T00:00:00.000Z",
      payload: null
    });

    expect(parsed.attempt).toBe(0);
  });

  it("rejects invalid payload", () => {
    const parsed = EventEnvelopeSchema.safeParse({
      id: "",
      eventType: "system.ping",
      source: "test-suite",
      occurredAt: "2026-02-21T00:00:00.000Z",
      payload: null
    });

    expect(parsed.success).toBe(false);
  });
});
