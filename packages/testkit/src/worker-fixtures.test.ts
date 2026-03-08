import { describe, expect, it } from "vitest";
import { createEventEnvelopeFixture, createServiceBusMessageFixture } from "./worker-fixtures.js";

describe("worker fixtures", () => {
  it("builds a valid event envelope fixture with sensible defaults", () => {
    const envelope = createEventEnvelopeFixture();
    expect(envelope.id).toBe("evt-1");
    expect(envelope.eventType).toBe("system.ping");
    expect(envelope.payload).toEqual({ ok: true });
  });

  it("supports envelope overrides", () => {
    const envelope = createEventEnvelopeFixture({
      id: "evt-custom",
      payload: { custom: true }
    });
    expect(envelope.id).toBe("evt-custom");
    expect(envelope.payload).toEqual({ custom: true });
  });

  it("creates a service bus message fixture with envelope defaults", () => {
    const message = createServiceBusMessageFixture();
    expect(message.messageId).toBe("evt-1");
    expect(message.deliveryCount).toBe(1);
  });
});
