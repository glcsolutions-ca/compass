# Operating Model

Compass uses deterministic cloud and desktop delivery with the same release logic.

## Core Rules

1. Commit stage is fast and PR-focused.
2. Merge queue gate validates the exact queued merge result.
3. Acceptance validates one frozen release package and returns YES/NO.
4. Production deploys only the accepted release package (no rebuilds).
5. Required gate contexts are `commit-stage` and `merge-queue-gate`.

## Key Terms

- `SHA`: commit fingerprint used across evidence artifacts.
- `Release package`: digest refs + scope metadata for one cloud delivery SHA.
- `Replay`: rerun acceptance/production for the same release package SHA.

## Canonical Stage Dependencies

1. `commit-stage.yml` runs scope detection on PR and merge-group SHAs; heavy fast checks run on PRs.
2. `merge-queue-gate.yml` runs exact-merge checks on merge queue groups.
3. `cloud-delivery-pipeline.yml` runs on `push` to `main`.
4. `cloud-delivery-replay.yml` runs manually for `release_package_sha`.
5. Cloud release package manifest is `.artifacts/release-package/<sha>/manifest.json`.
6. Cloud acceptance loads that release package and enforces runtime/infra/identity contracts.
7. Cloud production mutates only accepted release package refs, then verifies production behavior.
8. Final cloud decision artifact is `.artifacts/release/<sha>/decision.json`.
9. Final desktop decision artifact is `.artifacts/desktop-release/<sha>/decision.json`.
