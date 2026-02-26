import { z } from "zod";

export const HealthStatusSchema = z.literal("ok");

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  timestamp: z.string().datetime()
});

export const PingResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("api")
});

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

export const MembershipRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
export const MembershipStatusSchema = z.enum(["active", "invited", "disabled"]);

export const TenantSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "disabled"])
});

export const MembershipSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  tenantName: z.string().min(1),
  role: MembershipRoleSchema,
  status: MembershipStatusSchema
});

export const AuthUserSchema = z.object({
  id: z.string().min(1),
  primaryEmail: z.string().email().nullish(),
  displayName: z.string().min(1).nullish()
});

export const AuthMeResponseSchema = z.object({
  authenticated: z.boolean(),
  user: AuthUserSchema.nullish(),
  memberships: z.array(MembershipSchema),
  lastActiveTenantSlug: z.string().min(1).nullish()
});

export const TenantCreateRequestSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  name: z.string().min(1).max(120)
});

export const TenantCreateResponseSchema = z.object({
  tenant: TenantSchema,
  membership: z.object({
    role: MembershipRoleSchema,
    status: MembershipStatusSchema
  })
});

export const TenantReadResponseSchema = z.object({
  tenant: TenantSchema
});

export const TenantMemberSchema = z.object({
  userId: z.string().min(1),
  primaryEmail: z.string().email().nullish(),
  displayName: z.string().min(1).nullish(),
  role: MembershipRoleSchema,
  status: MembershipStatusSchema
});

export const TenantMembersResponseSchema = z.object({
  members: z.array(TenantMemberSchema)
});

export const TenantInviteCreateRequestSchema = z.object({
  email: z.string().email(),
  role: MembershipRoleSchema.exclude(["owner"]),
  expiresInDays: z.number().int().min(1).max(30).optional()
});

export const TenantInviteCreateResponseSchema = z.object({
  inviteId: z.string().min(1),
  expiresAt: z.string().datetime(),
  token: z.string().min(1)
});

export const TenantInviteAcceptResponseSchema = z.object({
  joined: z.boolean(),
  tenantSlug: z.string().min(1),
  role: MembershipRoleSchema,
  status: MembershipStatusSchema
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type PingResponse = z.infer<typeof PingResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;
export type Tenant = z.infer<typeof TenantSchema>;
export type Membership = z.infer<typeof MembershipSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
export type TenantCreateRequest = z.infer<typeof TenantCreateRequestSchema>;
export type TenantCreateResponse = z.infer<typeof TenantCreateResponseSchema>;
export type TenantReadResponse = z.infer<typeof TenantReadResponseSchema>;
export type TenantMember = z.infer<typeof TenantMemberSchema>;
export type TenantMembersResponse = z.infer<typeof TenantMembersResponseSchema>;
export type TenantInviteCreateRequest = z.infer<typeof TenantInviteCreateRequestSchema>;
export type TenantInviteCreateResponse = z.infer<typeof TenantInviteCreateResponseSchema>;
export type TenantInviteAcceptResponse = z.infer<typeof TenantInviteAcceptResponseSchema>;
