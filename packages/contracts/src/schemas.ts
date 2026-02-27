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

export const OrganizationMembershipRoleSchema = z.enum(["owner", "admin", "member"]);
export const WorkspaceMembershipRoleSchema = z.enum(["admin", "member"]);
export const MembershipStatusSchema = z.enum(["active", "invited", "disabled"]);

export const OrganizationSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["personal", "shared"]),
  ownerUserId: z.string().min(1).nullish(),
  home: z.boolean(),
  status: z.enum(["active", "disabled"])
});

export const OrganizationMembershipSchema = z.object({
  organizationId: z.string().min(1),
  organizationSlug: z.string().min(1),
  organizationName: z.string().min(1),
  role: OrganizationMembershipRoleSchema,
  status: MembershipStatusSchema
});

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  organizationSlug: z.string().min(1),
  organizationName: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  isPersonal: z.boolean(),
  role: WorkspaceMembershipRoleSchema,
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
  organizations: z.array(OrganizationMembershipSchema),
  workspaces: z.array(WorkspaceSchema),
  activeWorkspaceSlug: z.string().min(1).nullish(),
  personalWorkspaceSlug: z.string().min(1).nullish()
});

export const WorkspaceCreateRequestSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  name: z.string().min(1).max(120)
});

export const WorkspaceCreateResponseSchema = z.object({
  workspace: z.object({
    id: z.string().min(1),
    organizationId: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    isPersonal: z.boolean(),
    status: z.enum(["active", "disabled"])
  }),
  membership: z.object({
    role: WorkspaceMembershipRoleSchema,
    status: MembershipStatusSchema
  })
});

export const WorkspaceReadResponseSchema = z.object({
  workspace: z.object({
    id: z.string().min(1),
    organizationId: z.string().min(1),
    organizationSlug: z.string().min(1),
    organizationName: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    isPersonal: z.boolean(),
    status: z.enum(["active", "disabled"])
  })
});

export const WorkspaceMemberSchema = z.object({
  userId: z.string().min(1),
  primaryEmail: z.string().email().nullish(),
  displayName: z.string().min(1).nullish(),
  role: WorkspaceMembershipRoleSchema,
  status: MembershipStatusSchema
});

export const WorkspaceMembersResponseSchema = z.object({
  members: z.array(WorkspaceMemberSchema)
});

export const WorkspaceInviteCreateRequestSchema = z.object({
  email: z.string().email(),
  role: WorkspaceMembershipRoleSchema,
  expiresInDays: z.number().int().min(1).max(30).optional()
});

export const WorkspaceInviteCreateResponseSchema = z.object({
  inviteId: z.string().min(1),
  expiresAt: z.string().datetime(),
  token: z.string().min(1)
});

export const WorkspaceInviteAcceptResponseSchema = z.object({
  joined: z.boolean(),
  workspaceSlug: z.string().min(1),
  role: WorkspaceMembershipRoleSchema,
  status: MembershipStatusSchema
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type PingResponse = z.infer<typeof PingResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type OrganizationMembershipRole = z.infer<typeof OrganizationMembershipRoleSchema>;
export type WorkspaceMembershipRole = z.infer<typeof WorkspaceMembershipRoleSchema>;
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type OrganizationMembership = z.infer<typeof OrganizationMembershipSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
export type WorkspaceCreateRequest = z.infer<typeof WorkspaceCreateRequestSchema>;
export type WorkspaceCreateResponse = z.infer<typeof WorkspaceCreateResponseSchema>;
export type WorkspaceReadResponse = z.infer<typeof WorkspaceReadResponseSchema>;
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;
export type WorkspaceMembersResponse = z.infer<typeof WorkspaceMembersResponseSchema>;
export type WorkspaceInviteCreateRequest = z.infer<typeof WorkspaceInviteCreateRequestSchema>;
export type WorkspaceInviteCreateResponse = z.infer<typeof WorkspaceInviteCreateResponseSchema>;
export type WorkspaceInviteAcceptResponse = z.infer<typeof WorkspaceInviteAcceptResponseSchema>;
