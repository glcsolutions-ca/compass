# Auth Threat Model V1

Purpose: summarize core auth threats and required controls for Entra-only baseline.

## Scope

- web login and callback
- API auth and token/session handling
- secret and identity boundaries

## Primary Controls

- secret storage in Key Vault
- least-privilege identity wiring
- strict callback URI management
- auditable auth-related release evidence

## Validation

- run auth setup and verification runbook
- confirm auth smoke checks in pipeline evidence
