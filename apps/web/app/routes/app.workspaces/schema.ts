import { z } from "zod";

export const CreateWorkspaceSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Organization slug is required.")
    .regex(/^[a-z0-9-]+$/u, "Slug can include lowercase letters, numbers, and hyphens."),
  name: z.string().trim().min(1, "Organization name is required.")
});

export const AcceptInviteSchema = z.object({
  tenantSlug: z.string().trim().min(1, "Tenant slug is required."),
  inviteToken: z.string().trim().min(1, "Invite token is required.")
});

export const WorkspacesIntentSchema = z.enum(["create", "acceptInvite", "logout"]);

export type WorkspacesIntent = z.infer<typeof WorkspacesIntentSchema>;
