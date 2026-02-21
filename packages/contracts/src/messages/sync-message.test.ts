import { describe, expect, it } from "vitest";
import { SyncMessageSchema } from "./sync-message.js";

describe("SyncMessageSchema", () => {
  it("parses a valid message", () => {
    const parsed = SyncMessageSchema.parse({
      id: "msg-1",
      employeeId: "employee-123",
      sourceSystem: "jira",
      occurredAt: "2026-02-21T00:00:00.000Z",
      attempt: 1
    });

    expect(parsed.id).toBe("msg-1");
    expect(parsed.attempt).toBe(1);
  });

  it("applies default attempt value", () => {
    const parsed = SyncMessageSchema.parse({
      id: "msg-2",
      employeeId: "employee-123",
      sourceSystem: "legacy-erp",
      occurredAt: "2026-02-21T00:00:00.000Z"
    });

    expect(parsed.attempt).toBe(0);
  });

  it("rejects invalid payload", () => {
    const parsed = SyncMessageSchema.safeParse({
      id: "",
      employeeId: "employee-123",
      sourceSystem: "jira",
      occurredAt: "2026-02-21T00:00:00.000Z"
    });

    expect(parsed.success).toBe(false);
  });
});
