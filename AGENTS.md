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
- one native development pipeline workflow with `pull_request` queue admission and `merge_group` staged delivery
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
- `Queue Admission` exists only as a GitHub merge-queue prerequisite; it is not part of the deployment pipeline stage model
- manual `workflow_dispatch` is rare recovery redeploy only for a previously released candidate

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
- Treat manual `workflow_dispatch` as rare recovery redeploy:
  - previously released candidates only
  - no infra apply
  - no migrations
  - preferred operational response remains fix-forward with a new candidate
- Treat `check:commit` as the deployed-surface gate only:
  - `api`
  - `web`
  - `db-tools`
  - `contracts`
  - `sdk`
- Treat non-deployed code such as `apps/worker` as out of the required merge-queue path unless it is brought back into deploy scope.
