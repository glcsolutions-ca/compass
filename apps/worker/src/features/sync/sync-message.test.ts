import type { ServiceBusReceivedMessage } from "@azure/service-bus";
import { describe, expect, it } from "vitest";
import { parseSyncMessage } from "./sync-message.js";

function messageWithBody(body: unknown): ServiceBusReceivedMessage {
  return {
    body
  } as ServiceBusReceivedMessage;
}

describe("parseSyncMessage", () => {
  it("returns null for invalid payload", () => {
    const parsed = parseSyncMessage(messageWithBody({ id: "" }));
    expect(parsed).toBeNull();
  });

  it("parses valid object payload and applies attempt default", () => {
    const parsed = parseSyncMessage(
      messageWithBody({
        id: "evt-1",
        eventType: "system.ping",
        source: "test-suite",
        occurredAt: "2026-02-21T00:00:00.000Z",
        payload: { ok: true }
      })
    );

    expect(parsed).toEqual({
      id: "evt-1",
      eventType: "system.ping",
      source: "test-suite",
      occurredAt: "2026-02-21T00:00:00.000Z",
      attempt: 0,
      payload: { ok: true }
    });
  });

  it("parses valid JSON string payload", () => {
    const parsed = parseSyncMessage(
      messageWithBody(
        JSON.stringify({
          id: "evt-2",
          eventType: "system.ping",
          source: "test-suite",
          occurredAt: "2026-02-21T00:00:00.000Z",
          payload: null
        })
      )
    );

    expect(parsed?.id).toBe("evt-2");
  });
});
