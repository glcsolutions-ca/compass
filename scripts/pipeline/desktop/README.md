# Desktop Pipeline Scripts

## Purpose

`scripts/pipeline/desktop/` contains desktop deployment pipeline helpers.
This folder is intentionally separated from cloud pipeline scripts so desktop acceptance/production behavior stays easy to reason about.

## Current Scope

- `acceptance/run-desktop-backend-contract-acceptance.mjs`
  - Verifies desktop candidate compatibility with the current backend contract (`/api/v1/health`, `/api/v1/openapi.json`).

## Safety Notes

- Desktop scripts are non-mutating unless explicitly used in desktop production publish steps.
- Keep desktop script changes decoupled from cloud mutation logic.
