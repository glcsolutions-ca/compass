import { z } from "zod";

export const AgentExecutionModeSchema = z.enum(["cloud", "local"]);
export const AgentExecutionHostSchema = z.enum(["dynamic_sessions", "desktop_local"]);
export const AgentThreadStatusSchema = z.enum([
  "idle",
  "inProgress",
  "completed",
  "interrupted",
  "error"
]);

export const AgentThreadSchema = z.object({
  threadId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceSlug: z.string().min(1),
  executionMode: AgentExecutionModeSchema,
  executionHost: AgentExecutionHostSchema,
  status: AgentThreadStatusSchema,
  cloudSessionIdentifier: z.string().min(1).nullish(),
  title: z.string().min(1).nullish(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  modeSwitchedAt: z.string().datetime().nullish()
});

export const AgentThreadCreateRequestSchema = z.object({
  workspaceSlug: z.string().min(1),
  executionMode: AgentExecutionModeSchema.default("cloud"),
  executionHost: AgentExecutionHostSchema.optional(),
  title: z.string().trim().min(1).max(200).optional()
});

export const AgentThreadCreateResponseSchema = z.object({
  thread: AgentThreadSchema
});

export const AgentThreadReadResponseSchema = z.object({
  thread: AgentThreadSchema
});

export const AgentThreadModePatchRequestSchema = z.object({
  executionMode: AgentExecutionModeSchema,
  executionHost: AgentExecutionHostSchema.optional()
});

export const AgentThreadModePatchResponseSchema = z.object({
  thread: AgentThreadSchema
});

export const AgentTurnSchema = z.object({
  turnId: z.string().min(1),
  threadId: z.string().min(1),
  status: AgentThreadStatusSchema,
  executionMode: AgentExecutionModeSchema,
  executionHost: AgentExecutionHostSchema,
  input: z.unknown(),
  output: z.unknown().nullish(),
  error: z.unknown().nullish(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullish()
});

export const AgentTurnStartRequestSchema = z.object({
  text: z.string().min(1),
  executionMode: AgentExecutionModeSchema.optional(),
  executionHost: AgentExecutionHostSchema.optional(),
  model: z.string().min(1).optional(),
  approvalPolicy: z.string().min(1).optional(),
  sandboxPolicy: z.unknown().optional(),
  effort: z.string().min(1).optional(),
  personality: z.string().min(1).optional()
});

export const AgentTurnStartResponseSchema = z.object({
  turn: AgentTurnSchema,
  outputText: z.string().nullish()
});

export const AgentTurnInterruptResponseSchema = z.object({
  turn: AgentTurnSchema
});

export const AgentEventSchema = z.object({
  cursor: z.number().int().nonnegative(),
  threadId: z.string().min(1),
  turnId: z.string().min(1).nullish(),
  method: z.string().min(1),
  payload: z.unknown(),
  createdAt: z.string().datetime()
});

export const AgentEventsBatchRequestSchema = z.object({
  events: z.array(
    z.object({
      turnId: z.string().min(1).optional(),
      method: z.string().min(1),
      payload: z.unknown()
    })
  )
});

export const AgentEventsBatchResponseSchema = z.object({
  accepted: z.number().int().nonnegative()
});

export const AgentEventsListResponseSchema = z.object({
  events: z.array(AgentEventSchema)
});

export const AgentStreamEventTypeSchema = z.enum([
  "thread.started",
  "thread.modeSwitched",
  "turn.started",
  "item.started",
  "item.delta",
  "item.completed",
  "turn.completed",
  "approval.requested",
  "approval.resolved",
  "error"
]);

export const AgentStreamEventSchema = z.object({
  type: AgentStreamEventTypeSchema,
  method: z.string().optional(),
  requestId: z.string().optional(),
  payload: z.unknown(),
  cursor: z.number().int().nonnegative().optional()
});

// Compatibility aliases for the codex-gateway transition window.
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

export const StreamEventTypeSchema = AgentStreamEventTypeSchema;
export const StreamEventSchema = z.object({
  type: StreamEventTypeSchema,
  method: z.string().optional(),
  requestId: z.string().optional(),
  payload: z.unknown()
});

export type AgentExecutionMode = z.infer<typeof AgentExecutionModeSchema>;
export type AgentExecutionHost = z.infer<typeof AgentExecutionHostSchema>;
export type AgentThreadStatus = z.infer<typeof AgentThreadStatusSchema>;
export type AgentThread = z.infer<typeof AgentThreadSchema>;
export type AgentThreadCreateRequest = z.infer<typeof AgentThreadCreateRequestSchema>;
export type AgentThreadCreateResponse = z.infer<typeof AgentThreadCreateResponseSchema>;
export type AgentThreadReadResponse = z.infer<typeof AgentThreadReadResponseSchema>;
export type AgentThreadModePatchRequest = z.infer<typeof AgentThreadModePatchRequestSchema>;
export type AgentThreadModePatchResponse = z.infer<typeof AgentThreadModePatchResponseSchema>;
export type AgentTurn = z.infer<typeof AgentTurnSchema>;
export type AgentTurnStartRequest = z.infer<typeof AgentTurnStartRequestSchema>;
export type AgentTurnStartResponse = z.infer<typeof AgentTurnStartResponseSchema>;
export type AgentTurnInterruptResponse = z.infer<typeof AgentTurnInterruptResponseSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventsBatchRequest = z.infer<typeof AgentEventsBatchRequestSchema>;
export type AgentEventsBatchResponse = z.infer<typeof AgentEventsBatchResponseSchema>;
export type AgentEventsListResponse = z.infer<typeof AgentEventsListResponseSchema>;
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

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
