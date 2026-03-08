import {
  type WorkspaceCreateRequest,
  WorkspaceCreateRequestSchema,
  type WorkspaceInviteCreateRequest,
  WorkspaceInviteCreateRequestSchema
} from "@compass/contracts";
import { z } from "zod";

export const WorkspaceSlugParamsSchema = z.object({
  workspaceSlug: z.string().min(1)
});

export const InviteTokenParamsSchema = z.object({
  workspaceSlug: z.string().min(1),
  token: z.string().min(1)
});

export {
  WorkspaceCreateRequestSchema,
  WorkspaceInviteCreateRequestSchema,
  type WorkspaceCreateRequest,
  type WorkspaceInviteCreateRequest
};
