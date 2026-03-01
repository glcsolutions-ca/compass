# Entra SSO And Gateway Auth Contract

Purpose: contract for Entra login, callback handling, token/session behavior, and gateway auth boundaries.

## Scope

- Entra redirect/callback paths
- API auth expectations
- secret and identity wiring expectations

## Contract Rules

- callback and token exchange behavior must remain compatible
- secrets are sourced from Key Vault contracts
- auth-facing schema changes require contract regeneration

## Validation

```bash
pnpm contract:check
```

## Failure Mode

- incompatible auth changes block release until contract and runtime behavior align

## Source

- `packages/contracts/**`
- `apps/api/**`
- `docs/runbooks/entra-sso-setup.md`
