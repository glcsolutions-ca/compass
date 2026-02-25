export type LoginSearchParams = Record<string, string | string[] | undefined>;

export interface LoginPageModel {
  nextPath: string;
  errorCode: string | null;
  errorMessage: string | null;
}

function readQueryValue(searchParams: LoginSearchParams, key: string): string | null {
  const value = searchParams[key];
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0] ?? null;
  }

  return null;
}

export function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function resolveLoginErrorMessage(errorCode: string | null) {
  if (!errorCode) {
    return null;
  }

  if (errorCode === "entra_disabled") {
    return "Enterprise sign-in is currently unavailable.";
  }

  if (errorCode === "tenant_not_allowed") {
    return "Your Microsoft Entra tenant is not approved for access.";
  }

  if (errorCode === "provider_error") {
    return "Microsoft sign-in was canceled or denied.";
  }

  if (errorCode === "state_missing" || errorCode === "state_mismatch") {
    return "Your sign-in session expired. Start sign-in again.";
  }

  if (
    errorCode === "token_exchange_failed" ||
    errorCode === "id_token_invalid" ||
    errorCode === "id_token_missing"
  ) {
    return "Microsoft sign-in could not be completed. Try again.";
  }

  return "Sign-in failed. Try again.";
}

export function createLoginPageModel(searchParams: LoginSearchParams): LoginPageModel {
  const errorCode = readQueryValue(searchParams, "error");
  return {
    nextPath: normalizeNextPath(readQueryValue(searchParams, "next")),
    errorCode,
    errorMessage: resolveLoginErrorMessage(errorCode)
  };
}
