export type TokenType = "delegated" | "app";
export type SubjectType = "user" | "app";

export interface VerifiedAccessToken {
  tokenType: TokenType;
  tenantId: string;
  subjectType: SubjectType;
  subjectId: string;
  actorClientId: string;
  scopes: Set<string>;
  appRoles: Set<string>;
  rawClaims: Record<string, unknown>;
}

export interface AuthenticatedRequestContext extends VerifiedAccessToken {
  principalId: string;
  permissions: Set<string>;
}

export interface RouteAuthorizationPolicy {
  permission: string;
  delegatedScopes: string[];
  appRoles: string[];
  allowDelegated?: boolean;
  allowApp?: boolean;
  tenantParam?: string;
}

export interface ScimTokenContext {
  tenantId: string;
  clientId: string;
  scopes: Set<string>;
}

export interface ResolvedPrincipal {
  principalId: string;
  displayName: string;
}

export interface TenantRoleRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}
