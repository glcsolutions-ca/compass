# AGENTS.md

## Repo map

```text
compass/
├─ .github/workflows
├─ apps/{api,web,worker}
├─ bootstrap/{README.md,config}
├─ db/{migrations,postgres,scripts,seeds}
├─ infra/azure
├─ packages/{contracts,sdk,testkit}
├─ pipeline/{contracts,shared,stages}
└─ scripts/{bootstrap,dev,infra}
```

## Canonical architecture

The current target architecture is:

- one Azure production resource group: `rg-compass-prd-cc-001`
- one GitHub deployment environment: `production`
- GHCR only
- no Terraform
- no ACR
- no permanent Azure acceptance environment
- long-lived ACA app pairs:
  - `api-prod`
  - `web-prod`
  - `api-stage`
  - `web-stage`
- one migrate job
- Commit -> Acceptance -> Release only

## Main commands

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm check:ci`
- `pnpm --filter @compass/pipeline-tools run test`
- `pnpm infra:whatif`
- `pnpm infra:apply`

## Working style

- Keep changes small and reversible.
- Prefer the simplified production-only model over adding new parallel environments.
- Treat `scripts/bootstrap/*` as admin-only control-plane tooling.
- Treat `pipeline` as the source of truth for delivery policy and evidence.
