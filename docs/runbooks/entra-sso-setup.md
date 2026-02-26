# Entra SSO Setup Runbook

Configure enterprise sign-in for `apps/web` and `apps/api` (front-door login and OIDC callback handling).

## Scope

- Web login route: `GET /login`
- Entra flow routes:
  - `GET /v1/auth/entra/start`
  - `GET /v1/auth/entra/callback`
  - `POST /v1/auth/logout`
- Cloud deployment wiring via `infra/azure/**` and cloud deployment workflows.

## Prerequisites

- Identity bootstrap already completed (`docs/runbooks/cloud-deployment-pipeline-setup.md`).
- Ability to update:
  - `infra/identity/env/prod.tfvars` (localhost-only redirect defaults)
  - GitHub environment variables/secrets (`acceptance` and `production`)

## 1. Configure Entra App Registration

1. Keep only localhost callback URLs in [`prod.tfvars`](../../infra/identity/env/prod.tfvars) `web_redirect_uris`.
2. Set `ACA_WEB_CUSTOM_DOMAIN=<web-host>` in GitHub environment variables (`acceptance` and `production`).
3. Apply identity Terraform (see [`infra/identity/README.md`](../../infra/identity/README.md)); the module merges localhost defaults with `https://<ACA_WEB_CUSTOM_DOMAIN>/api/auth/entra/callback`.
4. Capture the web client id:

```bash
terraform -chdir=infra/identity output -raw web_application_client_id
```

5. Create/update a client secret for that app registration (store value immediately; Entra only shows it once):

```bash
WEB_APP_CLIENT_ID="<terraform output web_application_client_id>"
az ad app credential reset \
  --id "$WEB_APP_CLIENT_ID" \
  --display-name "compass-web-sso" \
  --append \
  --years 1 \
  --query password -o tsv
```

## 2. Configure GitHub Environment Inputs

Set these in both `acceptance` and `production`.

### Variables

- `ENTRA_LOGIN_ENABLED=true`
- `ENTRA_CLIENT_ID=<web app client id>`
- `ACA_WEB_CUSTOM_DOMAIN=<web-host>`
- `ENTRA_ALLOWED_TENANT_IDS=<tenant-guid>[,<tenant-guid>...]`
- `AUTH_DEV_FALLBACK_ENABLED=false`

### Secrets

- `ENTRA_CLIENT_SECRET=<web app client secret>`
- `WEB_SESSION_SECRET=<32+ char random secret>`

Generate a strong session secret if needed:

```bash
openssl rand -base64 48
```

## 3. Deploy Configuration

Run normal pipeline convergence (`deploy-infra` path). The web and API container apps must be updated with Entra settings:

- Web app:
  - `WEB_SESSION_SECRET`
  - `WEB_BASE_URL` (derived by infra from `ACA_WEB_CUSTOM_DOMAIN`)
- API app:
  - `ENTRA_LOGIN_ENABLED`
  - `ENTRA_CLIENT_ID`
  - `ENTRA_CLIENT_SECRET` (secret ref)
  - `WEB_BASE_URL`
  - `ENTRA_ALLOWED_TENANT_IDS`
  - `AUTH_DEV_FALLBACK_ENABLED`

## 4. Verify Runtime Behavior

1. Check API container app env:

```bash
az containerapp show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$ACA_API_APP_NAME" \
  --query "properties.template.containers[0].env[].name" \
  -o tsv
```

2. Browser checks:
   - Open `https://<web-host>/login`: should show "Enterprise Login" and "Sign in with Microsoft".
   - Open `https://<web-host>/`: without SSO cookie, should redirect to `/login?next=%2F`.

## Troubleshooting

- `Microsoft Entra Login Disabled`:
  - `ENTRA_LOGIN_ENABLED` is not `true` in deployed env.
  - Infra deployment has not converged with latest env/secrets.
- `/` does not redirect to `/login`:
  - `ENTRA_LOGIN_ENABLED` is false.
  - `AUTH_DEV_FALLBACK_ENABLED` is true (must be false in cloud).
- `ENTRA_CONFIG_REQUIRED` from `/v1/auth/entra/start`:
  - Missing `ENTRA_CLIENT_ID` or infra has not converged `WEB_BASE_URL`.
- Login returns `tenant_not_allowed`:
  - Add the tenant GUID to `ENTRA_ALLOWED_TENANT_IDS`.

## References

- [`apps/web/README.md`](../../apps/web/README.md)
- [`infra/azure/README.md`](../../infra/azure/README.md)
- [`infra/identity/README.md`](../../infra/identity/README.md)
- [`docs/runbooks/cloud-deployment-pipeline-setup.md`](./cloud-deployment-pipeline-setup.md)
