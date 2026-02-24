# Operating Model

Compass uses deterministic cloud and desktop delivery with the same release logic.

## Core Rules

1. Commit stage is fast and merge-blocking.
2. Acceptance validates one frozen release package and returns YES/NO.
3. Production deploys only the accepted release package (no rebuilds).
4. `commit-stage` is the single required branch-protection check.

## Key Terms

- `SHA`: commit fingerprint used across evidence artifacts.
- `Release package`: digest refs + scope metadata for one cloud delivery SHA.
- `Replay`: rerun acceptance/production for the same release package SHA.

## Canonical Stage Dependencies

1. `commit-stage.yml` runs scope detection and required fast checks.
2. `cloud-delivery-pipeline.yml` runs on `push` to `main`.
3. `cloud-delivery-replay.yml` runs manually for `release_package_sha`.
4. Cloud release package manifest is `.artifacts/release-package/<sha>/manifest.json`.
5. Cloud acceptance loads that release package and enforces runtime/infra/identity contracts.
6. Cloud production mutates only accepted release package refs, then verifies production behavior.
7. Final cloud decision artifact is `.artifacts/release/<sha>/decision.json`.
8. Final desktop decision artifact is `.artifacts/desktop-release/<sha>/decision.json`.
