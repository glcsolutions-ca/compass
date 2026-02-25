export const UNAUTHORIZED_AUTH_CODES = ["invalid_token", "token_unclassified"] as const;
export const FORBIDDEN_AUTH_CODES = [
  "tenant_denied",
  "assignment_denied",
  "permission_denied"
] as const;

export type UnauthorizedAuthCode = (typeof UNAUTHORIZED_AUTH_CODES)[number];
export type ForbiddenAuthCode = (typeof FORBIDDEN_AUTH_CODES)[number];
export type AuthErrorCode = UnauthorizedAuthCode | ForbiddenAuthCode;

export class AuthError extends Error {
  readonly statusCode: 401 | 403;
  readonly code: AuthErrorCode;

  constructor(statusCode: 401 | 403, code: AuthErrorCode, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function invalidToken(message: string) {
  return new AuthError(401, "invalid_token", message);
}

export function tokenUnclassified(
  message = "Token must include delegated scopes or application roles"
) {
  return new AuthError(401, "token_unclassified", message);
}

export function tenantDenied(message: string) {
  return new AuthError(403, "tenant_denied", message);
}

export function assignmentDenied(message: string) {
  return new AuthError(403, "assignment_denied", message);
}

export function permissionDenied(message: string) {
  return new AuthError(403, "permission_denied", message);
}
