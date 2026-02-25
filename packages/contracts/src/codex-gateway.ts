import { z } from "zod";

export const ApprovalDecisionSchema = z.enum(["accept", "decline"]);

export const ThreadStartRequestSchema = z.object({
  model: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  approvalPolicy: z.string().min(1).optional(),
  sandboxPolicy: z.unknown().optional(),
  personality: z.string().min(1).optional()
});

export const TurnStartRequestSchema = z.object({
  text: z.string().min(1),
  cwd: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  approvalPolicy: z.string().min(1).optional(),
  sandboxPolicy: z.unknown().optional(),
  effort: z.string().min(1).optional(),
  personality: z.string().min(1).optional()
});

export const TurnInterruptRequestSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1)
});

export const ApprovalResponseRequestSchema = z.object({
  decision: ApprovalDecisionSchema
});

export const ApiKeyLoginRequestSchema = z.object({
  apiKey: z.string().min(1)
});

export const ChatGptLoginCancelRequestSchema = z.object({
  loginId: z.string().min(1)
});

export const KnownAuthModeSchema = z.enum(["apiKey", "chatgpt", "service", "entra", "none"]);

export const AuthModeSchema = z.union([KnownAuthModeSchema, z.string().min(1)]);

export const AuthAccountSchema = z
  .object({
    type: AuthModeSchema.optional(),
    email: z.string().min(1).optional(),
    name: z.string().min(1).optional()
  })
  .passthrough();

export const AuthLoginStartResponseSchema = z
  .object({
    loginId: z.string().min(1).optional(),
    authUrl: z.string().url().optional(),
    account: AuthAccountSchema.nullish()
  })
  .passthrough();

export const AuthAccountReadResponseSchema = z
  .object({
    account: AuthAccountSchema.nullish()
  })
  .passthrough();

export const ThreadListResponseSchema = z.object({
  data: z.array(z.unknown())
});

export const ThreadReadResponseSchema = z.object({
  thread: z.unknown(),
  turns: z.array(z.unknown()),
  items: z.array(z.unknown()),
  approvals: z.array(z.unknown()),
  events: z.array(z.unknown())
});

export const StreamEventTypeSchema = z.enum([
  "thread.started",
  "turn.started",
  "item.started",
  "item.delta",
  "item.completed",
  "turn.completed",
  "approval.requested",
  "approval.resolved",
  "error"
]);

export const StreamEventSchema = z.object({
  type: StreamEventTypeSchema,
  method: z.string().optional(),
  requestId: z.string().optional(),
  payload: z.unknown()
});

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export type ThreadStartRequest = z.infer<typeof ThreadStartRequestSchema>;
export type TurnStartRequest = z.infer<typeof TurnStartRequestSchema>;
export type ApprovalResponseRequest = z.infer<typeof ApprovalResponseRequestSchema>;
export type ApiKeyLoginRequest = z.infer<typeof ApiKeyLoginRequestSchema>;
export type ChatGptLoginCancelRequest = z.infer<typeof ChatGptLoginCancelRequestSchema>;
export type AuthMode = z.infer<typeof AuthModeSchema>;
export type AuthAccount = z.infer<typeof AuthAccountSchema>;
export type AuthLoginStartResponse = z.infer<typeof AuthLoginStartResponseSchema>;
export type AuthAccountReadResponse = z.infer<typeof AuthAccountReadResponseSchema>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;
