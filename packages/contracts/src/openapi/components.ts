import { type OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  ThreadEventsBatchRequestSchema,
  ThreadEventsBatchResponseSchema,
  ThreadEventsListResponseSchema,
  RuntimeAccountLoginCancelRequestSchema,
  RuntimeAccountLoginCancelResponseSchema,
  RuntimeAccountLoginStartRequestSchema,
  RuntimeAccountLoginStartResponseSchema,
  RuntimeAccountLogoutResponseSchema,
  RuntimeAccountRateLimitsReadResponseSchema,
  RuntimeAccountReadRequestSchema,
  RuntimeAccountReadResponseSchema,
  RuntimeNotificationSchema,
  ThreadCreateRequestSchema,
  ThreadCreateResponseSchema,
  ThreadDeleteResponseSchema,
  ThreadListQuerySchema,
  ThreadListResponseSchema,
  ThreadModePatchRequestSchema,
  ThreadModePatchResponseSchema,
  ThreadPatchRequestSchema,
  ThreadPatchResponseSchema,
  ThreadReadResponseSchema,
  ThreadRuntimeLaunchResponseSchema,
  TurnInterruptResponseSchema,
  TurnStartRequestSchema,
  TurnStartResponseSchema
} from "../thread-runtime-gateway.js";
import {
  ApiErrorSchema,
  AuthMeResponseSchema,
  HealthResponseSchema,
  PingResponseSchema,
  WorkspaceCreateRequestSchema,
  WorkspaceCreateResponseSchema,
  WorkspaceInviteAcceptResponseSchema,
  WorkspaceInviteCreateRequestSchema,
  WorkspaceInviteCreateResponseSchema,
  WorkspaceMembersResponseSchema,
  WorkspaceReadResponseSchema
} from "../schemas.js";

export function registerOpenApiComponents(registry: OpenAPIRegistry): void {
  registry.register("HealthResponse", HealthResponseSchema);
  registry.register("PingResponse", PingResponseSchema);
  registry.register("ApiError", ApiErrorSchema);
  registry.register("AuthMeResponse", AuthMeResponseSchema);
  registry.register("WorkspaceCreateRequest", WorkspaceCreateRequestSchema);
  registry.register("WorkspaceCreateResponse", WorkspaceCreateResponseSchema);
  registry.register("WorkspaceReadResponse", WorkspaceReadResponseSchema);
  registry.register("WorkspaceMembersResponse", WorkspaceMembersResponseSchema);
  registry.register("WorkspaceInviteCreateRequest", WorkspaceInviteCreateRequestSchema);
  registry.register("WorkspaceInviteCreateResponse", WorkspaceInviteCreateResponseSchema);
  registry.register("WorkspaceInviteAcceptResponse", WorkspaceInviteAcceptResponseSchema);
  registry.register("ThreadCreateRequest", ThreadCreateRequestSchema);
  registry.register("ThreadCreateResponse", ThreadCreateResponseSchema);
  registry.register("ThreadReadResponse", ThreadReadResponseSchema);
  registry.register("ThreadListQuery", ThreadListQuerySchema);
  registry.register("ThreadListResponse", ThreadListResponseSchema);
  registry.register("ThreadPatchRequest", ThreadPatchRequestSchema);
  registry.register("ThreadPatchResponse", ThreadPatchResponseSchema);
  registry.register("ThreadDeleteResponse", ThreadDeleteResponseSchema);
  registry.register("ThreadModePatchRequest", ThreadModePatchRequestSchema);
  registry.register("ThreadModePatchResponse", ThreadModePatchResponseSchema);
  registry.register("TurnStartRequest", TurnStartRequestSchema);
  registry.register("TurnStartResponse", TurnStartResponseSchema);
  registry.register("TurnInterruptResponse", TurnInterruptResponseSchema);
  registry.register("ThreadRuntimeLaunchResponse", ThreadRuntimeLaunchResponseSchema);
  registry.register("ThreadEventsBatchRequest", ThreadEventsBatchRequestSchema);
  registry.register("ThreadEventsBatchResponse", ThreadEventsBatchResponseSchema);
  registry.register("ThreadEventsListResponse", ThreadEventsListResponseSchema);
  registry.register("RuntimeAccountReadRequest", RuntimeAccountReadRequestSchema);
  registry.register("RuntimeAccountReadResponse", RuntimeAccountReadResponseSchema);
  registry.register("RuntimeAccountLoginStartRequest", RuntimeAccountLoginStartRequestSchema);
  registry.register("RuntimeAccountLoginStartResponse", RuntimeAccountLoginStartResponseSchema);
  registry.register("RuntimeAccountLoginCancelRequest", RuntimeAccountLoginCancelRequestSchema);
  registry.register("RuntimeAccountLoginCancelResponse", RuntimeAccountLoginCancelResponseSchema);
  registry.register("RuntimeAccountLogoutResponse", RuntimeAccountLogoutResponseSchema);
  registry.register(
    "RuntimeAccountRateLimitsReadResponse",
    RuntimeAccountRateLimitsReadResponseSchema
  );
  registry.register("RuntimeNotification", RuntimeNotificationSchema);

  registry.registerComponent("securitySchemes", "sessionCookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "__Host-compass_session",
    description: "Opaque server-side session cookie"
  });
}
