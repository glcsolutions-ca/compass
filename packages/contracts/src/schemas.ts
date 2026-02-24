import { z } from "zod";

export const HealthStatusSchema = z.literal("ok");

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  timestamp: z.string().datetime()
});

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

export const UnauthorizedErrorCodeSchema = z.enum(["invalid_token", "token_unclassified"]);
export const ForbiddenErrorCodeSchema = z.enum([
  "tenant_denied",
  "assignment_denied",
  "permission_denied"
]);

export const UnauthorizedErrorSchema = ApiErrorSchema.extend({
  code: UnauthorizedErrorCodeSchema
});

export const ForbiddenErrorSchema = ApiErrorSchema.extend({
  code: ForbiddenErrorCodeSchema
});

export const TokenTypeSchema = z.enum(["delegated", "app"]);
export const SubjectTypeSchema = z.enum(["user", "app"]);

export const CallerContextSchema = z.object({
  tenantId: z.string().min(1),
  tokenType: TokenTypeSchema,
  subjectType: SubjectTypeSchema,
  subjectId: z.string().min(1),
  actorClientId: z.string().min(1)
});

export const MeResponseSchema = z.object({
  caller: CallerContextSchema
});

export const MePermissionsResponseSchema = z.object({
  caller: CallerContextSchema,
  permissions: z.array(z.string().min(1))
});

export const RoleSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  isSystem: z.boolean(),
  permissions: z.array(z.string().min(1))
});

export const RolesResponseSchema = z.object({
  items: z.array(RoleSchema)
});

export const CreateRoleRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  permissions: z.array(z.string().min(1)).min(1)
});

export const OAuthTokenRequestSchema = z.object({
  grant_type: z.literal("client_credentials"),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  scope: z.string().optional()
});

export const OAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string().optional()
});

export const ScimEmailSchema = z.object({
  value: z.string().email(),
  primary: z.boolean().optional()
});

export const ScimUserNameSchema = z.object({
  givenName: z.string().optional(),
  familyName: z.string().optional()
});

export const ScimUserSchema = z.object({
  id: z.string().optional(),
  externalId: z.string().min(1),
  userName: z.string().min(1),
  active: z.boolean().default(true),
  displayName: z.string().optional(),
  name: ScimUserNameSchema.optional(),
  emails: z.array(ScimEmailSchema).optional()
});

export const ScimGroupMemberSchema = z.object({
  value: z.string().min(1)
});

export const ScimGroupSchema = z.object({
  id: z.string().optional(),
  externalId: z.string().min(1),
  displayName: z.string().min(1),
  members: z.array(ScimGroupMemberSchema).default([])
});

export const ScimOkResponseSchema = z.object({
  id: z.string().min(1),
  externalId: z.string().min(1),
  active: z.boolean().optional()
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type UnauthorizedErrorCode = z.infer<typeof UnauthorizedErrorCodeSchema>;
export type ForbiddenErrorCode = z.infer<typeof ForbiddenErrorCodeSchema>;
export type UnauthorizedError = z.infer<typeof UnauthorizedErrorSchema>;
export type ForbiddenError = z.infer<typeof ForbiddenErrorSchema>;
export type CallerContext = z.infer<typeof CallerContextSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type MePermissionsResponse = z.infer<typeof MePermissionsResponseSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type RolesResponse = z.infer<typeof RolesResponseSchema>;
export type CreateRoleRequest = z.infer<typeof CreateRoleRequestSchema>;
export type OAuthTokenRequest = z.infer<typeof OAuthTokenRequestSchema>;
export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;
export type ScimUser = z.infer<typeof ScimUserSchema>;
export type ScimGroup = z.infer<typeof ScimGroupSchema>;
