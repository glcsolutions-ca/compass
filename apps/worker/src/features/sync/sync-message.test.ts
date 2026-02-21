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

  it("parses valid payload and applies attempt default", () => {
    const parsed = parseSyncMessage(
      messageWithBody({
        id: "msg-1",
        employeeId: "employee-123",
        sourceSystem: "jira",
        occurredAt: "2026-02-21T00:00:00.000Z"
      })
    );

    expect(parsed).toEqual({
      id: "msg-1",
      employeeId: "employee-123",
      sourceSystem: "jira",
      occurredAt: "2026-02-21T00:00:00.000Z",
      attempt: 0
    });
  });
});
