# Runbooks

Canonical pipeline explanation: `../development-pipeline.md`.

## Runbook Index

- [`azure-service-bus-one-pager.md`](./azure-service-bus-one-pager.md): concise Service Bus topology, security, and operations playbook.
- [`cloud-deployment-pipeline-setup.md`](./cloud-deployment-pipeline-setup.md): canonical cloud runbook for one-time bootstrap and ongoing automated delivery.
- [`cloud-pipeline-farley-review.md`](./cloud-pipeline-farley-review.md): stage-by-stage Farley-first cloud pipeline review, scoring rubric, and recommendations.
- [`cloud-pipeline-farley-decision-log.md`](./cloud-pipeline-farley-decision-log.md): decision log for accepted/rejected recommendations at each review stage.
- [`test-quick-farley-assessment.md`](./test-quick-farley-assessment.md): trunk-wide Farley-first assessment of `pnpm test:quick` with timing evidence, overlap analysis, and vNext recommendations.
- [`entra-sso-setup.md`](./entra-sso-setup.md): enterprise Microsoft Entra SSO setup and verification for web front-door login.
- [`desktop-deployment-pipeline.md`](./desktop-deployment-pipeline.md): desktop installer delivery operations.
- [`agent-runtime-groundwork.md`](./agent-runtime-groundwork.md): operating baseline for dual-mode agent groundwork (`cloud` + `local`) and validation checks.
- [`dynamic-sessions-one-pager.md`](./dynamic-sessions-one-pager.md): production Dynamic Sessions plumbing, identity model, pipeline evidence, and rollout guardrails.
- [`auth-v1-cutover.md`](./auth-v1-cutover.md): Entra-only auth baseline reset and cutover flow.
- [`auth-v1-pilot-readiness.md`](./auth-v1-pilot-readiness.md): post-launch two-tenant pilot operations and strict exit gate.
- [`github-governance-verification.md`](./github-governance-verification.md): governance and branch-protection verification.
- [`migration-playbook.md`](./migration-playbook.md): canonical migration fundamentals and operating rules.
- [`migration-safety.md`](./migration-safety.md): migration rollout and rollback safety practices.
- [`postgres-local.md`](./postgres-local.md): local Postgres startup, migration, and seed operations.
