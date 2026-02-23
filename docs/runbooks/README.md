# Runbooks

## Runbook Index

- [`deploy-aca.md`](./deploy-aca.md): production release pipeline and ACA deployment operations.
- [`github-governance-verification.md`](./github-governance-verification.md): governance and GitHub policy verification checks.
- [`migration-safety.md`](./migration-safety.md): migration rollout and rollback safety practices.
- [`postgres-local.md`](./postgres-local.md): local Postgres startup, migration, and seed operations.
- [`prod-closeout-2026-02-22.md`](./prod-closeout-2026-02-22.md): historical production closeout evidence snapshot.

## When To Use Each Runbook

| Situation                                                         | Runbook                             |
| ----------------------------------------------------------------- | ----------------------------------- |
| You need to understand or troubleshoot production release flow    | `deploy-aca.md`                     |
| You need to validate branch protection and merge governance setup | `github-governance-verification.md` |
| You are planning or validating migration safety boundaries        | `migration-safety.md`               |
| You are setting up local database dependencies                    | `postgres-local.md`                 |
| You need historical evidence from a prior production closeout     | `prod-closeout-2026-02-22.md`       |

## Cross-Links To Code-Area READMEs

- Apps index: [`../../apps/README.md`](../../apps/README.md)
- Packages index: [`../../packages/README.md`](../../packages/README.md)
- Contracts package: [`../../packages/contracts/README.md`](../../packages/contracts/README.md)
- SDK package: [`../../packages/sdk/README.md`](../../packages/sdk/README.md)
- Scripts index: [`../../scripts/README.md`](../../scripts/README.md)
- Infra index: [`../../infra/README.md`](../../infra/README.md)
