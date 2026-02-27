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

export const RuntimeProviderSchema = z.enum([
  "dynamic_sessions",
  "local_process",
  "local_docker",
  "mock"
]);

export const CodexAuthModeSchema = z.enum(["apikey", "chatgpt", "chatgptAuthTokens"]);

export const RuntimeCapabilitiesSchema = z.object({
  interactiveAuth: z.boolean(),
  supportsChatgptManaged: z.boolean(),
  supportsApiKey: z.boolean(),
  supportsChatgptAuthTokens: z.boolean(),
  supportsRateLimits: z.boolean(),
  supportsRuntimeStream: z.boolean()
});

export const RuntimeAccountSchema = z
  .object({
    type: z.string().min(1).optional(),
    email: z.string().min(1).nullable().optional(),
    name: z.string().min(1).nullable().optional(),
    planType: z.string().min(1).nullable().optional(),
    label: z.string().min(1).nullable().optional()
  })
  .passthrough();

export const RuntimeAccountStateSchema = z.object({
  provider: RuntimeProviderSchema,
  capabilities: RuntimeCapabilitiesSchema,
  authMode: CodexAuthModeSchema.nullable(),
  requiresOpenaiAuth: z.boolean(),
  account: RuntimeAccountSchema.nullable()
});

export const RuntimeAccountReadRequestSchema = z.object({
  refreshToken: z.boolean().optional()
});

export const RuntimeAccountReadResponseSchema = RuntimeAccountStateSchema;

export const RuntimeAccountLoginStartRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chatgpt")
  }),
  z.object({
    type: z.literal("apiKey"),
    apiKey: z.string().min(1)
  }),
  z.object({
    type: z.literal("chatgptAuthTokens"),
    accessToken: z.string().min(1),
    chatgptAccountId: z.string().min(1),
    chatgptPlanType: z.string().min(1).nullable().optional()
  })
]);

export const RuntimeAccountLoginStartResponseSchema = z.object({
  type: z.enum(["chatgpt", "apiKey", "chatgptAuthTokens"]),
  loginId: z.string().min(1).nullable().optional(),
  authUrl: z.string().url().nullable().optional()
});

export const RuntimeAccountLoginCancelRequestSchema = z.object({
  loginId: z.string().min(1)
});

export const RuntimeAccountLoginCancelResponseSchema = z
  .object({
    status: z.string().min(1).optional()
  })
  .passthrough();

export const RuntimeAccountLogoutResponseSchema = z.object({});

export const RuntimeRateLimitWindowSchema = z.object({
  usedPercent: z.number().min(0).max(100),
  windowDurationMins: z.number().int().positive().nullable(),
  resetsAt: z.number().int().nonnegative().nullable()
});

export const RuntimeRateLimitSnapshotSchema = z.object({
  limitId: z.string().min(1).nullable(),
  limitName: z.string().min(1).nullable(),
  primary: RuntimeRateLimitWindowSchema.nullable(),
  secondary: RuntimeRateLimitWindowSchema.nullable(),
  credits: z.unknown().nullable().optional(),
  planType: z.string().min(1).nullable().optional()
});

export const RuntimeAccountRateLimitsReadResponseSchema = z.object({
  rateLimits: RuntimeRateLimitSnapshotSchema.nullable(),
  rateLimitsByLimitId: z.record(RuntimeRateLimitSnapshotSchema.nullable()).nullable()
});

export const RuntimeNotificationMethodSchema = z.enum([
  "account/login/completed",
  "account/updated",
  "account/rateLimits/updated",
  "mcpServer/oauthLogin/completed"
]);

export const RuntimeNotificationSchema = z.object({
  cursor: z.number().int().nonnegative().optional(),
  method: RuntimeNotificationMethodSchema,
  params: z.unknown(),
  createdAt: z.string().datetime()
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
export type RuntimeProvider = z.infer<typeof RuntimeProviderSchema>;
export type CodexAuthMode = z.infer<typeof CodexAuthModeSchema>;
export type RuntimeCapabilities = z.infer<typeof RuntimeCapabilitiesSchema>;
export type RuntimeAccount = z.infer<typeof RuntimeAccountSchema>;
export type RuntimeAccountState = z.infer<typeof RuntimeAccountStateSchema>;
export type RuntimeAccountReadRequest = z.infer<typeof RuntimeAccountReadRequestSchema>;
export type RuntimeAccountReadResponse = z.infer<typeof RuntimeAccountReadResponseSchema>;
export type RuntimeAccountLoginStartRequest = z.infer<typeof RuntimeAccountLoginStartRequestSchema>;
export type RuntimeAccountLoginStartResponse = z.infer<
  typeof RuntimeAccountLoginStartResponseSchema
>;
export type RuntimeAccountLoginCancelRequest = z.infer<
  typeof RuntimeAccountLoginCancelRequestSchema
>;
export type RuntimeAccountLoginCancelResponse = z.infer<
  typeof RuntimeAccountLoginCancelResponseSchema
>;
export type RuntimeAccountLogoutResponse = z.infer<typeof RuntimeAccountLogoutResponseSchema>;
export type RuntimeRateLimitWindow = z.infer<typeof RuntimeRateLimitWindowSchema>;
export type RuntimeRateLimitSnapshot = z.infer<typeof RuntimeRateLimitSnapshotSchema>;
export type RuntimeAccountRateLimitsReadResponse = z.infer<
  typeof RuntimeAccountRateLimitsReadResponseSchema
>;
export type RuntimeNotificationMethod = z.infer<typeof RuntimeNotificationMethodSchema>;
export type RuntimeNotification = z.infer<typeof RuntimeNotificationSchema>;
