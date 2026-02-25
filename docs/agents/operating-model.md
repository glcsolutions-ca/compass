# Operating Model

Compass uses trunk-first cloud and desktop delivery with one release-candidate model.

## Core Rules

1. `main` is the integration line and must stay releasable.
2. `commit-stage` and `integration-gate` run on push to `main`.
3. Automated acceptance test gate validates one immutable release candidate and returns YES/NO.
4. Deployment stage deploys only accepted release candidates (no rebuild).
5. Repeated hard deterministic gate failures on `main` are auto-reverted by recovery workflow.

## Key Terms

- `Release candidate`: immutable refs + scope metadata for one SHA.
- `Deploy`: copy software to environment and run it.
- `Release`: make capability available to users.
- `Replay`: rerun acceptance/deployment verification for an existing release candidate SHA.

## Canonical Stage Dependencies

1. `commit-stage.yml` runs on push to `main` (optional PR preview also supported).
2. `integration-gate.yml` runs on push to `main` (optional PR preview also supported).
3. `cloud-deployment-pipeline.yml` runs on push to `main`.
4. `cloud-deployment-pipeline-replay.yml` runs manually for `release_candidate_sha`.
5. Cloud release candidate manifest is `.artifacts/release-candidate/<sha>/manifest.json`.
6. Cloud automated acceptance test gate loads that release candidate and evaluates runtime/infra/identity acceptance.
7. Cloud deployment stage mutates only accepted release-candidate refs and performs post-deployment verification.
8. Cloud release decision artifact is `.artifacts/release/<sha>/decision.json`.
9. Desktop release decision artifact is `.artifacts/desktop-release/<sha>/decision.json`.
