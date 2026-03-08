import { z } from "zod";

export const EntraStartQuerySchema = z.object({
  returnTo: z.string().optional(),
  client: z.enum(["browser", "desktop"]).optional()
});

export const EntraAdminConsentQuerySchema = z.object({
  tenantHint: z.string().optional(),
  returnTo: z.string().optional(),
  client: z.enum(["browser", "desktop"]).optional()
});

export const EntraCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  admin_consent: z.string().optional(),
  tenant: z.string().optional(),
  scope: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

export const EntraDesktopCompleteQuerySchema = z.object({
  handoff: z.string().min(1)
});
