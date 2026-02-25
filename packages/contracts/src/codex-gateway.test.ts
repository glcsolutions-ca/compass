import { describe, expect, it } from "vitest";
import { ApiErrorSchema } from "./schemas.js";
import {
  AuthAccountReadResponseSchema,
  AuthLoginStartResponseSchema,
  AuthModeSchema,
  ApiKeyLoginRequestSchema,
  ApprovalResponseRequestSchema,
  ChatGptLoginCancelRequestSchema,
  StreamEventSchema,
  ThreadStartRequestSchema,
  TurnInterruptRequestSchema,
  TurnStartRequestSchema
} from "./codex-gateway.js";

describe("codex gateway contract schemas", () => {
  it("accepts valid request payloads", () => {
    expect(
      ThreadStartRequestSchema.parse({
        model: "gpt-5-codex",
        cwd: "/workspace",
        approvalPolicy: "manual"
      })
    ).toEqual({
      model: "gpt-5-codex",
      cwd: "/workspace",
      approvalPolicy: "manual"
    });

    expect(TurnStartRequestSchema.parse({ text: "hello" }).text).toBe("hello");
    expect(
      TurnInterruptRequestSchema.parse({
        threadId: "thr_1",
        turnId: "turn_1"
      })
    ).toEqual({
      threadId: "thr_1",
      turnId: "turn_1"
    });
    expect(ApprovalResponseRequestSchema.parse({ decision: "accept" }).decision).toBe("accept");
    expect(ApiKeyLoginRequestSchema.parse({ apiKey: "sk-test" }).apiKey).toBe("sk-test");
    expect(ChatGptLoginCancelRequestSchema.parse({ loginId: "login_1" }).loginId).toBe("login_1");
    expect(AuthModeSchema.parse("chatgpt")).toBe("chatgpt");
    expect(
      AuthLoginStartResponseSchema.parse({
        loginId: "login_1",
        authUrl: "https://chat.openai.com/oauth",
        account: {
          type: "chatgpt",
          email: "user@example.com"
        }
      }).loginId
    ).toBe("login_1");
    expect(
      AuthAccountReadResponseSchema.parse({
        account: {
          type: "apiKey"
        }
      }).account?.type
    ).toBe("apiKey");
  });

  it("rejects invalid request payloads", () => {
    expect(TurnStartRequestSchema.safeParse({}).success).toBe(false);
    expect(
      TurnInterruptRequestSchema.safeParse({
        threadId: "",
        turnId: "turn_1"
      }).success
    ).toBe(false);
    expect(ApprovalResponseRequestSchema.safeParse({ decision: "maybe" }).success).toBe(false);
    expect(ApiKeyLoginRequestSchema.safeParse({ apiKey: "" }).success).toBe(false);
  });

  it("accepts valid stream events and rejects malformed events", () => {
    const parsed = StreamEventSchema.parse({
      type: "approval.requested",
      method: "item/commandExecution/requestApproval",
      requestId: "approval_1",
      payload: {
        threadId: "thr_1"
      }
    });

    expect(parsed.type).toBe("approval.requested");
    expect(StreamEventSchema.safeParse({ payload: {} }).success).toBe(false);
    expect(StreamEventSchema.safeParse({ type: "unknown", payload: {} }).success).toBe(false);
  });

  it("keeps shared API error shape stable", () => {
    const parsed = ApiErrorSchema.parse({
      code: "INTERNAL_ERROR",
      message: "Unexpected failure"
    });

    expect(parsed.code).toBe("INTERNAL_ERROR");
    expect(ApiErrorSchema.safeParse({ code: "ERR" }).success).toBe(false);
  });
});
