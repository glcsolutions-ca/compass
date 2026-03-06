import { describe, expect, it } from "vitest";
import { ControlPlaneTurnRunMessageSchema, SessionAgentInboundMessageSchema } from "./index.js";

describe("session-agent-protocol", () => {
  it("parses turn.run outbound messages", () => {
    const parsed = ControlPlaneTurnRunMessageSchema.parse({
      type: "turn.run",
      requestId: "request-1",
      threadId: "thread-1",
      turnId: "turn-1",
      text: "hello"
    });

    expect(parsed.turnId).toBe("turn-1");
  });

  it("parses turn.result inbound messages", () => {
    const parsed = SessionAgentInboundMessageSchema.parse({
      type: "turn.result",
      requestId: "request-1",
      turnId: "turn-1",
      outputText: "echo:hello",
      runtime: {
        sessionIdentifier: "thr-thread-1",
        bootId: "boot-1",
        runtimeKind: "echo",
        pid: 42
      }
    });

    expect(parsed.type).toBe("turn.result");
  });
});
