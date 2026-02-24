# Cloud Delivery Pipeline Runbook

## Purpose

Run and troubleshoot cloud delivery with one clear flow:

- build one release package
- test that same package in acceptance
- deploy that same package to production
- verify production behavior

## Canonical Flow

```mermaid
flowchart TD
A["Code change (Small Batch)"] --> B["Quick checks on PR (Commit Stage / Fast Feedback)"]
B --> C["Exact merge checks in queue (Integration Confidence)"]
C --> D["Build one release package on main (Build Once)"]
D --> E["Test same package in acceptance (Promote, Don't Rebuild)"]
E --> F["Deploy same package to production (Continuous Delivery)"]
F --> G["Verify production behavior + auth (Production Verification)"]
G --> H{"All checks pass?"}
H -- "No" --> X["Stop and fix forward (Fast Feedback)"]
H -- "Yes" --> I["Release complete (Release on Demand)"]
```

## Workflow Files

- PR fast feedback: `.github/workflows/commit-stage.yml`
- Merge queue exact-merge gate: `.github/workflows/merge-queue-gate.yml`
- Push path: `.github/workflows/cloud-delivery-pipeline.yml`
- Manual replay path: `.github/workflows/cloud-delivery-replay.yml`

## Trigger Model

- `commit-stage.yml`: `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`) + `merge_group`
- `merge-queue-gate.yml`: `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`) + `merge_group`
- `cloud-delivery-pipeline.yml`: `push` to `main`
- `cloud-delivery-replay.yml`: `workflow_dispatch` with `release_package_sha`

## Stage-by-Stage (Simple Language + Farley Terms)

1. Commit Stage / Fast Feedback

- Run quick PR checks.
- Decide whether the PR is merge-ready.

2. Integration Confidence (Exact Merge)

- Run focused checks on the queued merge result.
- Confirm exact merge behavior before it lands in `main`.

3. Build Once

- Build digest-pinned runtime images when runtime changed.
- If runtime did not change but infra needs convergence, capture current runtime digests.
- Publish one release package manifest.

4. Promote, Don't Rebuild

- Load `.artifacts/release-package/<sha>/manifest.json`.
- Validate digest refs and release package contract.

5. Acceptance Stage

- Run required acceptance checks by scope.
- Emit one decision: `YES` or `NO`.

6. Continuous Delivery

- If acceptance is `YES` and deploy is required, run production mutation under lock `production-mutation`.
- Deploy the exact package refs from the manifest.

7. Production Verification

- Verify `commit-stage` evidence for the release SHA.
- Verify `merge-queue-gate` evidence for the release SHA.
- Verify auth canary freshness.
- Verify delegated probe freshness for target SHA.
- Run API smoke and browser smoke.

8. Release on Demand Evidence

- Write final release decision artifact at `.artifacts/release/<sha>/decision.json`.

## Artifact Contracts

- Commit stage evidence: `.artifacts/commit-stage/<sha>/evidence.json`
- Merge queue evidence: `.artifacts/merge-queue-gate/<sha>/result.json`
- Merge queue timing: `.artifacts/merge-queue-gate/<sha>/timing.json`
- Release package manifest: `.artifacts/release-package/<sha>/manifest.json`
- Acceptance result: `.artifacts/acceptance/<sha>/result.json`
- Production result: `.artifacts/production/<sha>/result.json`
- Final release decision: `.artifacts/release/<sha>/decision.json`
- Timing evidence: `.artifacts/pipeline/<sha>/timing.json`

## Replay Procedure

Use replay when you need to rerun delivery for an existing release package SHA without rebuilding images.

1. Trigger `cloud-delivery-replay.yml`.
2. Provide `release_package_sha`.
3. Replay loads artifact `release-package-<sha>` from a successful push run.
4. Replay runs acceptance -> deploy -> production verification -> release decision.

## Failure Response

- Commit stage failed: fix in PR and rerun fast checks.
- Merge queue gate failed: fix forward in PR and re-queue.
- Acceptance failed: fix forward, then merge a new small batch.
- Production verification failed: treat as release failure, fix forward, then re-deliver.
- Replay failure: investigate drift/config issues; replay should fail closed.

## Required Production Auth Inputs (Smoke)

- `API_SMOKE_ALLOWED_TENANT_ID`
- `API_SMOKE_ALLOWED_CLIENT_ID`
- `API_SMOKE_ALLOWED_CLIENT_SECRET`
- `API_SMOKE_ALLOWED_SCOPE`
- `API_SMOKE_DENIED_TENANT_ID`
- `API_SMOKE_DENIED_CLIENT_ID`
- `API_SMOKE_DENIED_CLIENT_SECRET`
- `API_SMOKE_DENIED_SCOPE`
- `API_SMOKE_DENIED_EXPECTED_CODE`

## Non-Negotiables

- Do not rebuild runtime images in production stage jobs.
- Keep production mutation serialized (`production-mutation`).
- Keep acceptance credentials read-only and separate from production credentials.
- Keep branch protection checks explicit: `commit-stage` for PR quality and `merge-queue-gate` for exact merge safety.

## Scratch Drill Note (2026-02-24)

- This runbook is used as a docs-drift target during full scratch recovery drills.
- Drill-trigger commits may include non-functional markers in `db/scripts/**`, `infra/azure/**`, and `infra/identity/**` to force full-scope pipeline execution.
- Final-proof reruns follow the same trigger pattern after fix-forward merges to preserve a true clean-slate guarantee.
