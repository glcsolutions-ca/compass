# Operating Model

Compass uses deterministic cloud and desktop delivery with the same release logic.

## Core Rules

1. Commit stage is fast and PR-focused.
2. Integration gate validates the exact queued merge result.
3. Automated acceptance test gate validates one frozen release candidate and returns YES/NO.
4. Deployment stage deploys only the accepted release candidate (no rebuilds).
5. Required gate contexts are `commit-stage` and `integration-gate`.

## Key Terms

- `SHA`: commit fingerprint used across evidence artifacts.
- `Release candidate`: digest refs + scope metadata for one cloud deployment pipeline SHA.
- `Replay`: rerun automated-acceptance-test-gate/deployment-stage for the same release candidate SHA.

## Canonical Stage Dependencies

1. `commit-stage.yml` runs scope detection on PR and merge-group SHAs; heavy fast checks run on PRs.
2. `integration-gate.yml` runs exact-merge checks on merge-group batches.
3. `cloud-deployment-pipeline.yml` runs on `push` to `main`.
4. `cloud-deployment-pipeline-replay.yml` runs manually for `release_candidate_sha`.
5. Cloud release candidate manifest is `.artifacts/release-candidate/<sha>/manifest.json`.
6. Cloud automated acceptance test gate loads that release candidate and enforces runtime/infra/identity contracts.
7. Cloud deployment stage mutates only accepted release candidate refs, then verifies production behavior.
8. Final cloud decision artifact is `.artifacts/release/<sha>/decision.json`.
9. Final desktop decision artifact is `.artifacts/desktop-release/<sha>/decision.json`.
