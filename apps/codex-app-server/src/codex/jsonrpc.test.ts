import { describe, expect, it } from "vitest";
import {
  CodexRpcError,
  isJsonRpcError,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse
} from "./jsonrpc.js";

describe("jsonrpc guards", () => {
  it("identifies valid request and notification shapes", () => {
    expect(
      isJsonRpcRequest({
        id: "1",
        method: "thread/start",
        params: {}
      })
    ).toBe(true);

    expect(
      isJsonRpcNotification({
        method: "turn/completed",
        params: {}
      })
    ).toBe(true);
  });

  it("identifies valid response and error shapes", () => {
    expect(
      isJsonRpcResponse({
        id: 1,
        result: {
          ok: true
        }
      })
    ).toBe(true);

    expect(
      isJsonRpcError({
        id: "1",
        error: {
          code: -32601,
          message: "Not found"
        }
      })
    ).toBe(true);
  });

  it("rejects malformed messages", () => {
    expect(
      isJsonRpcRequest({
        method: "thread/start"
      })
    ).toBe(false);

    expect(
      isJsonRpcNotification({
        id: "1",
        method: "thread/start"
      })
    ).toBe(false);

    expect(
      isJsonRpcResponse({
        id: "1"
      })
    ).toBe(false);

    expect(
      isJsonRpcError({
        id: "1",
        error: {
          code: "bad",
          message: 123
        }
      })
    ).toBe(false);
  });
});

describe("CodexRpcError", () => {
  it("preserves rpc metadata", () => {
    const error = new CodexRpcError(-32001, "Overloaded", { retryable: true });

    expect(error.code).toBe(-32001);
    expect(error.message).toBe("Overloaded");
    expect(error.data).toEqual({ retryable: true });
  });
});
