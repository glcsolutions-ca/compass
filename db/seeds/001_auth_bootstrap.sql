WITH bootstrap AS (
  SELECT
    {{AUTH_BOOTSTRAP_ALLOWED_TENANT_ID}}::text AS tenant_id,
    {{AUTH_BOOTSTRAP_ALLOWED_APP_CLIENT_ID}}::text AS app_client_id,
    {{AUTH_BOOTSTRAP_DELEGATED_USER_OID}}::text AS delegated_user_oid,
    {{AUTH_BOOTSTRAP_DELEGATED_USER_EMAIL}}::text AS delegated_user_email,
    {{AUTH_BOOTSTRAP_DELEGATED_USER_DISPLAY_NAME}}::text AS delegated_user_display_name
)
INSERT INTO tenants (id, name, status, safelist_status, onboarding_mode, approved_at, created_at, updated_at)
SELECT
  tenant_id,
  'Auth Bootstrap Tenant',
  'active',
  'approved',
  'hybrid',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM bootstrap
ON CONFLICT (id) DO UPDATE
SET
  status = EXCLUDED.status,
  safelist_status = EXCLUDED.safelist_status,
  onboarding_mode = EXCLUDED.onboarding_mode,
  approved_at = EXCLUDED.approved_at,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO permissions (id, description, created_at)
VALUES
  ('profile.read', 'Read authenticated principal profile', CURRENT_TIMESTAMP),
  ('roles.read', 'Read tenant role configuration', CURRENT_TIMESTAMP),
  ('roles.write', 'Manage tenant role configuration', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

WITH bootstrap AS (
  SELECT {{AUTH_BOOTSTRAP_ALLOWED_TENANT_ID}}::text AS tenant_id
),
seed_roles AS (
  SELECT
    tenant_id,
    'role_auth_smoke_user_' || tenant_id AS role_user_id,
    'role_auth_smoke_app_' || tenant_id AS role_app_id
  FROM bootstrap
)
INSERT INTO roles (id, tenant_id, name, description, is_system, created_at, updated_at)
SELECT role_user_id, tenant_id, 'Auth Smoke User', 'Baseline delegated smoke role', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM seed_roles
UNION ALL
SELECT role_app_id, tenant_id, 'Auth Smoke App', 'Baseline app smoke role', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM seed_roles
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system,
  updated_at = CURRENT_TIMESTAMP;

WITH bootstrap AS (
  SELECT {{AUTH_BOOTSTRAP_ALLOWED_TENANT_ID}}::text AS tenant_id
),
seed_roles AS (
  SELECT
    tenant_id,
    'role_auth_smoke_user_' || tenant_id AS role_user_id,
    'role_auth_smoke_app_' || tenant_id AS role_app_id
  FROM bootstrap
)
INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_at)
SELECT tenant_id, role_user_id, 'profile.read', CURRENT_TIMESTAMP
FROM seed_roles
UNION ALL
SELECT tenant_id, role_app_id, 'profile.read', CURRENT_TIMESTAMP
FROM seed_roles
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH bootstrap AS (
  SELECT
    {{AUTH_BOOTSTRAP_ALLOWED_TENANT_ID}}::text AS tenant_id,
    {{AUTH_BOOTSTRAP_ALLOWED_APP_CLIENT_ID}}::text AS app_client_id,
    {{AUTH_BOOTSTRAP_DELEGATED_USER_OID}}::text AS delegated_user_oid,
    {{AUTH_BOOTSTRAP_DELEGATED_USER_DISPLAY_NAME}}::text AS delegated_user_display_name
)
INSERT INTO principals (id, tenant_id, principal_type, display_name, status, created_at, updated_at)
SELECT
  'principal_auth_smoke_user_' || tenant_id,
  tenant_id,
  'user',
  delegated_user_display_name,
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM bootstrap
UNION ALL
SELECT
  'principal_auth_smoke_app_' || tenant_id,
  tenant_id,
  'app',
  'Auth Smoke App',
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM bootstrap
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  principal_type = EXCLUDED.principal_type,
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;

WITH bootstrap AS (
  SELECT
    {{AUTH_BOOTSTRAP_ALLOWED_TENANT_ID}}::text AS tenant_id,
    {{AUTH_BOOTSTRAP_DELEGATED_USER_EMAIL}}::text AS delegated_user_email,
    {{AUTH_BOOTSTRAP_DELEGATED_USER_DISPLAY_NAME}}::text AS delegated_user_display_name
)
INSERT INTO users (
  id,
  tenant_id,
  principal_id,
  email,
  display_name,
  active,
  created_at,
  updated_at
)
SELECT
  'user_auth_smoke_' || tenant_id,
  tenant_id,
  'principal_auth_smoke_user_' || tenant_id,
  delegated_user_email,
  delegated_user_display_name,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM bootstrap
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  principal_id = EXCLUDED.principal_id,
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  active = EXCLUDED.active,
  updated_at = CURRENT_TIMESTAMP;

WITH bootstrap AS (
  SELECT
    {{AUTH_BOOTSTRAP_ALLOWED_TENANT_ID}}::text AS tenant_id,
    {{AUTH_BOOTSTRAP_ALLOWED_APP_CLIENT_ID}}::text AS app_client_id,
    {{AUTH_BOOTSTRAP_DELEGATED_USER_OID}}::text AS delegated_user_oid
)
INSERT INTO identities (
  id,
  tenant_id,
  principal_id,
  provider,
  subject,
  object_id,
  app_id,
  claims,
  created_at,
  updated_at
)
SELECT
  'identity_auth_smoke_user_' || tenant_id,
  tenant_id,
  'principal_auth_smoke_user_' || tenant_id,
  'entra-user',
  delegated_user_oid,
  delegated_user_oid,
  NULL,
  jsonb_build_object('tid', tenant_id, 'oid', delegated_user_oid),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM bootstrap
UNION ALL
SELECT
  'identity_auth_smoke_app_' || tenant_id,
  tenant_id,
  'principal_auth_smoke_app_' || tenant_id,
  'entra-app',
  app_client_id,
  NULL,
  app_client_id,
  jsonb_build_object('tid', tenant_id, 'appid', app_client_id),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM bootstrap
ON CONFLICT (tenant_id, provider, subject) DO UPDATE
SET
  id = EXCLUDED.id,
  tenant_id = EXCLUDED.tenant_id,
  principal_id = EXCLUDED.principal_id,
  provider = EXCLUDED.provider,
  subject = EXCLUDED.subject,
  object_id = EXCLUDED.object_id,
  app_id = EXCLUDED.app_id,
  claims = EXCLUDED.claims,
  updated_at = CURRENT_TIMESTAMP;

WITH bootstrap AS (
  SELECT {{AUTH_BOOTSTRAP_ALLOWED_TENANT_ID}}::text AS tenant_id
),
seed_roles AS (
  SELECT
    tenant_id,
    'role_auth_smoke_user_' || tenant_id AS role_user_id,
    'role_auth_smoke_app_' || tenant_id AS role_app_id
  FROM bootstrap
)
INSERT INTO principal_role_bindings (id, tenant_id, principal_id, role_id, source, created_at)
SELECT
  'binding_auth_smoke_user_' || tenant_id,
  tenant_id,
  'principal_auth_smoke_user_' || tenant_id,
  role_user_id,
  'direct',
  CURRENT_TIMESTAMP
FROM seed_roles
UNION ALL
SELECT
  'binding_auth_smoke_app_' || tenant_id,
  tenant_id,
  'principal_auth_smoke_app_' || tenant_id,
  role_app_id,
  'direct',
  CURRENT_TIMESTAMP
FROM seed_roles
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  principal_id = EXCLUDED.principal_id,
  role_id = EXCLUDED.role_id,
  source = EXCLUDED.source;
