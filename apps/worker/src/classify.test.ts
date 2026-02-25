import { describe, expect, it } from "vitest";
import { classifySettlement } from "./classify.js";

describe("classifySettlement", () => {
  it("acks when there is no error", () => {
    const action = classifySettlement({ deliveryCount: 1 } as never, null);
    expect(action).toBe("ack");
  });

  it("retries before max delivery attempts", () => {
    const action = classifySettlement({ deliveryCount: 2 } as never, new Error("boom"), 5);
    expect(action).toBe("retry");
  });

  it("dead-letters at max delivery attempts", () => {
    const action = classifySettlement({ deliveryCount: 5 } as never, new Error("boom"), 5);
    expect(action).toBe("dead-letter");
  });
});
