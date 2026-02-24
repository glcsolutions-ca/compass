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
export type StreamEvent = z.infer<typeof StreamEventSchema>;
