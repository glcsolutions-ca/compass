# AGENTS.md

## Repo map

```text
compass/
├─ .github/{actions,workflows,labeler.yml}
├─ apps/{api,web,desktop}
├─ bootstrap/{README.md,config}
├─ docs/{architecture,adr,spikes}
├─ packages/{contracts,database,runtime-agent,runtime-protocol,sdk,testkit,ui}
├─ platform/{infra,pipeline,scripts}
└─ tests/acceptance/{api,desktop,web}
```

## Canonical architecture

The current target architecture is:

- one Azure production resource group: `rg-compass-prd-cc-001`
- one GitHub deployment environment: `production`
- one PR labels workflow: `05-pr-labels.yml`
- one queue-admission workflow: `09-queue-admission.yml`
- one commit workflow: `10-commit-stage.yml`
- one acceptance workflow: `20-acceptance.yml`
- one release workflow: `30-release.yml`
- one infra workflow: `40-infra.yml`
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

## Typical workflow

1. Start from `main` and create a short-lived branch for one small change.
2. Practice TDD: add or update the smallest failing test first.
3. Run the narrowest local command that proves the failure.
4. Make the minimal code change to get back to green.
5. Refactor only after the test is green.
6. Before push, run the relevant package-level checks and then `pnpm test`.
7. Open a small PR quickly and prefer regular merge-queue flow over batching work.
8. After the PR checks are green, enable auto-merge or run `gh pr merge --auto` so GitHub can place the PR into merge queue.

Agents should prefer these commands during the normal edit loop:

- `pnpm install`
- `pnpm dev`
- `pnpm --filter @compass/web test`
- `pnpm --filter @compass/api test`
- `pnpm --filter @compass/api test:integration`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:acceptance`
- `gh pr create --base main`
- `gh pr merge --auto`

Notes for agents:

- Prefer the smallest relevant test command before running the full suite.
- Treat `pnpm test` as the standard pre-push gate.
- Expect `git push` to run local hooks; do not bypass them unless explicitly asked.
- Keep PRs small enough that they can merge and deploy independently.

## Main commands

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm test:acceptance`
- `pnpm --filter @compass/pipeline-tools run test`
- `pnpm infra:whatif`
- `pnpm infra:apply`

## Working style

- Keep changes small and reversible.
- Prefer the simplified production-only model over adding new parallel environments.
- Treat `platform/scripts/bootstrap/*` as admin-only control-plane tooling.
- Treat `platform/pipeline` as the source of truth for delivery policy and evidence.
- Treat merge queue as the native entry point to the real development pipeline.
- Treat `pnpm test` as the one common fast local suite for developers and agents.
- Treat `05-pr-labels.yml` as metadata only.
- Treat `09-queue-admission.yml` as the PR-head no-op status that lets merge queue request the integrated build.
- Treat `10-commit-stage.yml` as the authoritative merge-group-only path that builds, smokes, and publishes the candidate once.
- Treat `20-acceptance.yml` as the candidate-validation path triggered from successful Commit Stage runs.
- Treat `30-release.yml` as the candidate-promotion path triggered from successful Acceptance runs.
- Treat `40-infra.yml` as the separate infra validation/apply path for Azure infra files, infra scripts, and the direct workflow support files it executes.
- Treat non-deployed platform tooling as out of the required merge-queue path unless it is brought back into deploy scope.
