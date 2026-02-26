import { z } from "zod";
import { resolveReturnTo } from "~/lib/auth/auth-session";

const LoginQuerySchema = z.object({
  returnTo: z.string().optional(),
  next: z.string().optional(),
  error: z.string().optional(),
  consent: z.string().optional(),
  tenantHint: z.string().optional()
});

export interface LoginQueryModel {
  returnTo: string;
  error: string | null;
  consent: string | null;
  tenantHint: string;
}

export function readLoginQuery(url: URL): LoginQueryModel {
  const parsed = LoginQuerySchema.safeParse({
    returnTo: url.searchParams.get("returnTo") ?? undefined,
    next: url.searchParams.get("next") ?? undefined,
    error: url.searchParams.get("error") ?? undefined,
    consent: url.searchParams.get("consent") ?? undefined,
    tenantHint: url.searchParams.get("tenantHint") ?? undefined
  });

  if (!parsed.success) {
    return {
      returnTo: "/",
      error: null,
      consent: null,
      tenantHint: ""
    };
  }

  return {
    returnTo: resolveReturnTo(parsed.data.returnTo ?? parsed.data.next ?? null),
    error: parsed.data.error ?? null,
    consent: parsed.data.consent ?? null,
    tenantHint: parsed.data.tenantHint?.trim() ?? ""
  };
}
