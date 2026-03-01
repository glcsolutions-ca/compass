# Entra SSO Setup Runbook

Purpose: configure and verify Entra SSO for web/API auth.

## When To Use

- initial setup
- redirect URI changes
- client secret rotation

## Inputs

- Entra app ID
- Key Vault name
- expected callback URLs

## Steps

1. Configure redirect URIs on Entra app.
2. Rotate client secret and store `entra-client-secret` in Key Vault.
3. Seed or verify required Key Vault secrets.
4. Validate secret contract with pipeline helper.
5. Deploy via standard cloud pipeline.

## Verify

- callback URLs are correct
- secret exists in Key Vault
- login callback and API auth succeed

## Failure Handling

- correct Entra app config or secrets
- redeploy and verify again
