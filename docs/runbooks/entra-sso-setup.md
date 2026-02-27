# Entra SSO Setup Runbook (KeyVault-First)

Configure and operate Entra login for the single cloud environment.

## Fundamental Goal

Keep one source of truth per concern:

- Entra app registration controls redirect URIs and OAuth credentials.
- Azure Key Vault stores runtime secrets (`entra-client-secret` and related auth secrets).
- Cloud pipeline on `main` deploys and verifies runtime behavior.

## Scope

- Web login route: `GET /login`
- Entra flow routes:
  - `GET /v1/auth/entra/start` (`client=browser|desktop`)
  - `GET /v1/auth/entra/callback`
  - `GET /v1/auth/desktop/complete`
  - `POST /v1/auth/logout`
- Cloud deployment wiring via `infra/azure/**` and cloud deployment workflows.

## Prerequisites

- Custom domains are live and TLS-bound:
  - `compass.glcsolutions.ca` (web)
  - `api.compass.glcsolutions.ca` (api)
- Cloud infra contract in repo:
  - [`infra/azure/environments/cloud.bicepparam`](../../infra/azure/environments/cloud.bicepparam)
- Key Vault exists and is reachable by runtime identity.

## 1. Configure Entra Redirect URIs

Set redirect URIs to custom-domain callback plus localhost dev callbacks only.

```bash
APP_ID="0f3ba6d0-5415-441a-b8af-357699d364d1"

az ad app update \
  --id "$APP_ID" \
  --web-redirect-uris \
    "https://compass.glcsolutions.ca/v1/auth/entra/callback" \
    "http://localhost:3000/v1/auth/entra/callback" \
    "http://127.0.0.1:3000/v1/auth/entra/callback"
```

Verify:

```bash
az ad app show --id "$APP_ID" --query "web.redirectUris" -o tsv
```

Do not keep internal ACA host callbacks once custom-domain auth is stable.

## 2. Rotate Entra Client Secret and Store in Key Vault

Create a fresh credential and immediately write it to Key Vault `entra-client-secret`.

```bash
APP_ID="0f3ba6d0-5415-441a-b8af-357699d364d1"
KEY_VAULT_NAME="<kv-name>"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

CLIENT_SECRET="$(az ad app credential reset \
  --id "$APP_ID" \
  --append \
  --display-name "compass-prod-$STAMP" \
  --years 1 \
  --query password -o tsv)"

az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "entra-client-secret" \
  --value "$CLIENT_SECRET" \
  --output none
```

Prune stale app credentials (keep only the newest production credential and any approved local-dev credential):

```bash
az ad app credential list --id "$APP_ID" -o table
# delete by keyId when credential is no longer needed
az ad app credential delete --id "$APP_ID" --key-id "<old-key-id>"
```

## 3. Seed and Validate Key Vault Secret Contract

Required secrets:

- `postgres-admin-password`
- `web-session-secret`
- `entra-client-secret`
- `auth-oidc-state-encryption-key`
- `oauth-token-signing-secret`

Seed/update:

```bash
export KEY_VAULT_NAME="<kv-name>"
# optionally set ENTRA_CLIENT_SECRET and other vars before running
node scripts/infra/seed-keyvault-secrets.mjs
```

Validate contract:

```bash
node scripts/pipeline/cloud/deployment-stage/validate-keyvault-secrets.mjs
```

## 4. Deploy Through `main` Pipeline

Push changes to `main` and use `cloud-deployment-pipeline.yml` as the only deploy path.

The pipeline now resolves production URLs from Bicep deployment outputs, not internal ACA FQDNs:

- `apiBaseUrlOutput`
- `webBaseUrlOutput`

Smoke checks fail closed if Entra authorize redirect does not carry:

- `redirect_uri=https://compass.glcsolutions.ca/v1/auth/entra/callback`

## 5. Verify Runtime Behavior

Check API health:

```bash
curl -i "https://api.compass.glcsolutions.ca/health"
```

Check auth start redirect URI:

```bash
curl -sSI "https://compass.glcsolutions.ca/v1/auth/entra/start?returnTo=%2F" | grep -i '^location:'
```

The `location` URL must include:

`redirect_uri=https%3A%2F%2Fcompass.glcsolutions.ca%2Fv1%2Fauth%2Fentra%2Fcallback`

Check desktop start redirect shape (same Entra authorize endpoint, desktop client hint accepted):

```bash
curl -sSI "https://compass.glcsolutions.ca/v1/auth/entra/start?client=desktop&returnTo=%2F" | grep -i '^location:'
```

The redirect still targets:

- host `login.microsoftonline.com`
- path `/organizations/oauth2/v2.0/authorize`
- `redirect_uri=https://compass.glcsolutions.ca/v1/auth/entra/callback`

Check desktop completion endpoint exists (it should not be `404`):

```bash
curl -i "https://compass.glcsolutions.ca/v1/auth/desktop/complete?handoff=invalid"
```

Expected behavior:

- endpoint is routed by API (status is not `404`)
- invalid handoff redirects to `/login?error=desktop_handoff_invalid`

## Troubleshooting

- `AADSTS50011` (redirect URI mismatch):
  - Entra app redirect list is missing or incorrect for `https://compass.glcsolutions.ca/v1/auth/entra/callback`.
  - Update redirect URIs and retry.
- Desktop app does not return to Compass after browser sign-in:
  - Verify API supports `GET /v1/auth/desktop/complete` (non-`404`), then rebuild desktop app with matching deep-link scheme.
  - `DESKTOP_AUTH_SCHEME` should be reverse-domain style and aligned between API env and desktop packaging config.
- `/v1/auth/entra/start` returns internal ACA callback host:
  - API runtime `WEB_BASE_URL` is wrong.
  - Re-run cloud deploy from `main` and confirm IaC params keep custom domains set.
- `ENTRA_CONFIG_REQUIRED`:
  - Missing Key Vault secret(s) or runtime cannot read them.
  - Validate secret contract and Key Vault RBAC (`Key Vault Secrets User`) for runtime identity.

## References

- [`infra/azure/README.md`](../../infra/azure/README.md)
- [`docs/runbooks/cloud-deployment-pipeline-setup.md`](./cloud-deployment-pipeline-setup.md)
- [`infra/identity/README.md`](../../infra/identity/README.md)
