# AGENTS.md

## Repo map

```text
compass/
├─ .github/{actions,workflows,labeler.yml}
├─ apps/{api,web,desktop}
├─ bootstrap/{README.md,config}
├─ docs/{architecture,adr,spikes}
├─ packages/{client-app,contracts,database,runtime-agent,runtime-protocol,sdk,shared,testing,ui}
├─ platform/{infra,pipeline,scripts}
└─ tests/acceptance/{api,desktop,web}
```

## Canonical architecture

The current target architecture is:

- one Azure production resource group: `rg-compass-prd-cc-001`
- one GitHub deployment environment: `production`
- one commit workflow: `10-commit-stage.yml`
- one mainline promotion workflow: `20-mainline-promotion.yml`
- one required merge-queue status check: `Commit Stage`
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
- pull request labels are metadata only; they do not control delivery routing
- manual `workflow_dispatch` is rare recovery redeploy only for a previously released candidate

## Main commands

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm check`
- `pnpm check:product`
- `pnpm check:commit`
- `pnpm check:pipeline`
- `pnpm --filter @compass/pipeline-tools run test`
- `pnpm infra:whatif`
- `pnpm infra:apply`

## Working style

- Keep changes small and reversible.
- Prefer the simplified production-only model over adding new parallel environments.
- Treat `platform/scripts/bootstrap/*` as admin-only control-plane tooling.
- Treat `platform/pipeline` as the source of truth for delivery policy and evidence.
- Treat merge queue as the native entry point to the real development pipeline.
- Treat `10-commit-stage.yml` as the one required check path:
  - `pull_request`: cheap preflight plus labels
  - `merge_group`: the full authoritative commit stage and candidate publication
- Treat `20-mainline-promotion.yml` as the post-merge delivery path:
  - `push` to `main`: Acceptance then Release
  - `workflow_dispatch`: rare recovery redeploy of a previously published candidate
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
- Treat non-deployed platform tooling as out of the required merge-queue path unless it is brought back into deploy scope.
