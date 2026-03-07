import { z } from "zod";

export const ExecutionModeSchema = z.enum(["cloud", "local"]);
export const ExecutionHostSchema = z.enum(["dynamic_sessions", "desktop_local"]);
export const ThreadStatusSchema = z.enum([
  "idle",
  "inProgress",
  "completed",
  "interrupted",
  "error"
]);

export const ThreadSchema = z.object({
  threadId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceSlug: z.string().min(1),
  executionMode: ExecutionModeSchema,
  executionHost: ExecutionHostSchema,
  status: ThreadStatusSchema,
  sessionIdentifier: z.string().min(1).nullish(),
  title: z.string().min(1).nullish(),
  archived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  modeSwitchedAt: z.string().datetime().nullish()
});

export const ThreadCreateRequestSchema = z.object({
  workspaceSlug: z.string().min(1),
  executionMode: ExecutionModeSchema.default("cloud"),
  executionHost: ExecutionHostSchema.optional(),
  title: z.string().trim().min(1).max(200).optional()
});

export const ThreadCreateResponseSchema = z.object({
  thread: ThreadSchema
});

export const ThreadReadResponseSchema = z.object({
  thread: ThreadSchema
});

export const ThreadListStateSchema = z.enum(["regular", "archived", "all"]);

export const ThreadListQuerySchema = z.object({
  workspaceSlug: z.string().min(1),
  state: ThreadListStateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export const ThreadListResponseSchema = z.object({
  threads: z.array(ThreadSchema)
});

export const ThreadPatchRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    archived: z.boolean().optional()
  })
  .refine((value) => value.title !== undefined || value.archived !== undefined, {
    message: "At least one thread field must be provided"
  });

export const ThreadPatchResponseSchema = z.object({
  thread: ThreadSchema
});

export const ThreadDeleteResponseSchema = z.object({
  deleted: z.literal(true)
});

export const ThreadModePatchRequestSchema = z.object({
  executionMode: ExecutionModeSchema,
  executionHost: ExecutionHostSchema.optional()
});

export const ThreadModePatchResponseSchema = z.object({
  thread: ThreadSchema
});

export const TurnSchema = z.object({
  turnId: z.string().min(1),
  threadId: z.string().min(1),
  parentTurnId: z.string().min(1).nullish(),
  sourceTurnId: z.string().min(1).nullish(),
  clientRequestId: z.string().min(1).nullish(),
  status: ThreadStatusSchema,
  executionMode: ExecutionModeSchema,
  executionHost: ExecutionHostSchema,
  input: z.unknown(),
  output: z.unknown().nullish(),
  error: z.unknown().nullish(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullish()
});

export const TurnStartRequestSchema = z.object({
  text: z.string().min(1),
  clientRequestId: z.string().min(1).optional(),
  parentTurnId: z.string().min(1).optional(),
  sourceTurnId: z.string().min(1).optional(),
  executionMode: ExecutionModeSchema.optional(),
  executionHost: ExecutionHostSchema.optional(),
  model: z.string().min(1).optional(),
  approvalPolicy: z.string().min(1).optional(),
  sandboxPolicy: z.unknown().optional(),
  effort: z.string().min(1).optional(),
  personality: z.string().min(1).optional()
});

export const TurnStartResponseSchema = z.object({
  turn: TurnSchema,
  outputText: z.string().nullish(),
  runtime: z
    .object({
      sessionIdentifier: z.string().min(1),
      connectionState: z.enum(["bootstrapped", "reused"]),
      runtimeKind: z.string().min(1),
      bootId: z.string().min(1),
      pid: z.number().int().positive().nullable().optional()
    })
    .optional()
});

export const TurnInterruptResponseSchema = z.object({
  turn: TurnSchema
});

export const ThreadRuntimeLaunchResponseSchema = z.object({
  launch: z.object({
    sessionIdentifier: z.string().min(1),
    bootId: z.string().min(1),
    controlPlaneUrl: z.string().url(),
    connectToken: z.string().min(1),
    expiresAt: z.string().datetime(),
    runtimeKind: z.string().min(1)
  })
});

export const ThreadEventSchema = z.object({
  cursor: z.number().int().nonnegative(),
  threadId: z.string().min(1),
  turnId: z.string().min(1).nullish(),
  method: z.string().min(1),
  payload: z.unknown(),
  createdAt: z.string().datetime()
});

export const ThreadEventsBatchRequestSchema = z.object({
  events: z.array(
    z.object({
      turnId: z.string().min(1).optional(),
      method: z.string().min(1),
      payload: z.unknown()
    })
  )
});

export const ThreadEventsBatchResponseSchema = z.object({
  accepted: z.number().int().nonnegative()
});

export const ThreadEventsListResponseSchema = z.object({
  events: z.array(ThreadEventSchema)
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

export const ThreadStreamEventTypeSchema = z.enum([
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

export const ThreadStreamEventSchema = z.object({
  type: ThreadStreamEventTypeSchema,
  method: z.string().optional(),
  requestId: z.string().optional(),
  payload: z.unknown(),
  cursor: z.number().int().nonnegative().optional()
});

export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type ExecutionHost = z.infer<typeof ExecutionHostSchema>;
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;
export type Thread = z.infer<typeof ThreadSchema>;
export type ThreadCreateRequest = z.infer<typeof ThreadCreateRequestSchema>;
export type ThreadCreateResponse = z.infer<typeof ThreadCreateResponseSchema>;
export type ThreadReadResponse = z.infer<typeof ThreadReadResponseSchema>;
export type ThreadListState = z.infer<typeof ThreadListStateSchema>;
export type ThreadListQuery = z.infer<typeof ThreadListQuerySchema>;
export type ThreadListResponse = z.infer<typeof ThreadListResponseSchema>;
export type ThreadPatchRequest = z.infer<typeof ThreadPatchRequestSchema>;
export type ThreadPatchResponse = z.infer<typeof ThreadPatchResponseSchema>;
export type ThreadDeleteResponse = z.infer<typeof ThreadDeleteResponseSchema>;
export type ThreadModePatchRequest = z.infer<typeof ThreadModePatchRequestSchema>;
export type ThreadModePatchResponse = z.infer<typeof ThreadModePatchResponseSchema>;
export type Turn = z.infer<typeof TurnSchema>;
export type TurnStartRequest = z.infer<typeof TurnStartRequestSchema>;
export type TurnStartResponse = z.infer<typeof TurnStartResponseSchema>;
export type TurnInterruptResponse = z.infer<typeof TurnInterruptResponseSchema>;
export type ThreadEvent = z.infer<typeof ThreadEventSchema>;
export type ThreadEventsBatchRequest = z.infer<typeof ThreadEventsBatchRequestSchema>;
export type ThreadEventsBatchResponse = z.infer<typeof ThreadEventsBatchResponseSchema>;
export type ThreadEventsListResponse = z.infer<typeof ThreadEventsListResponseSchema>;
export type ThreadStreamEvent = z.infer<typeof ThreadStreamEventSchema>;
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
