# AGENTS.md

## Repo map

```text
compass/
├─ .github/{actions,workflows}
├─ apps/{api,web,worker,desktop,codex-session-runtime}
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
- one native development pipeline workflow triggered by `merge_group`
- one required merge-queue status check: `Pipeline Complete`
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
- `Commit Stage -> Acceptance Stage -> Release Stage`

## Main commands

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm check`
- `pnpm check:commit`
- `pnpm check:pipeline`
- `pnpm --filter @compass/pipeline-tools run test`
- `pnpm infra:whatif`
- `pnpm infra:apply`

## Working style

- Keep changes small and reversible.
- Prefer the simplified production-only model over adding new parallel environments.
- Treat `scripts/bootstrap/*` as admin-only control-plane tooling.
- Treat `pipeline` as the source of truth for delivery policy and evidence.
- Treat merge queue as the native entry point to the real development pipeline.
