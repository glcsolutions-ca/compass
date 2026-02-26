# Test:Quick Farley-First Assessment (Trunk-Wide)

Date: 2026-02-26  
Scope: trunk-wide `pnpm test:quick` (cloud lane prioritized in interpretation)  
Baseline commit: `51385ca`

## 1) Executive Summary

`pnpm test:quick` is already deterministic, fast (avg ~11s on warm local runs), and strongly aligned with Farley commit-stage intent.

Primary findings:

1. Gate outcome determinism is strong (5/5 repeated runs passed with the same pass markers).
2. Most time is concentrated in three checks: `test:unit` (31.9%), `format:check` (15.6%), `contract:check` (12.1%).
3. The only low commit-stage-relevance blocker is `ci:terminology-policy` (language governance); it is cheap but not release-safety critical.
4. Overlap exists (`typecheck:refs` vs `typecheck`, `ci:testing-policy` vs ESLint test-hygiene rules), but current overlap is mostly defensive and acceptable.

Recommended target:

- Move `ci:terminology-policy` out of `test:quick` into a dedicated CI governance check (still required in commit stage), keeping `test:quick` focused on release-safety evidence.

Expected quick-gate impact:

- Avg runtime reduction: ~0.46s (4.2%)
- No loss of critical release-safety coverage (terminology remains enforced in CI)

## 2) Current-State Evidence Map

Baseline chain from [package.json](/Users/justinkropp/.codex/worktrees/9faf/compass/package.json):

1. `ci:high-risk-mainline-policy`
2. `ci:testing-policy`
3. `ci:terminology-policy`
4. `ci:service-bus-auth-contract`
5. `db:migrate:check`
6. `format:check`
7. `lint`
8. `typecheck:refs`
9. `typecheck`
10. `test:unit`
11. `contract:check`

### Control Map (purpose, owner, CI overlap)

| Check                          | Primary purpose                                                 | Owner implementation                                                                 | CI overlap (commit stage)                       | Avg runtime (s) |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- | --------------- |
| `ci:high-risk-mainline-policy` | Block risky direct commits to `main` (`HR001`)                  | `scripts/pipeline/commit/check-high-risk-mainline-policy.mjs`                        | Indirect via `pnpm test` in `commit-test-suite` | 0.40            |
| `ci:testing-policy`            | Enforce `TC001/010/011/020` placement/skip/tooling rules        | `scripts/pipeline/commit/check-testing-policy.mjs` + `tests/policy/test-policy.json` | Indirect via `pnpm test` in `commit-test-suite` | 0.40            |
| `ci:terminology-policy`        | Enforce Farley terminology policy consistency                   | `scripts/pipeline/commit/check-terminology-policy.mjs`                               | Indirect via `pnpm test` in `commit-test-suite` | 0.46            |
| `ci:service-bus-auth-contract` | Block forbidden Service Bus connection string patterns          | `scripts/pipeline/commit/check-service-bus-auth-contract.mjs`                        | Indirect via `pnpm test` in `commit-test-suite` | 0.39            |
| `db:migrate:check`             | Migration filename/checksum policy validation                   | `db/scripts/check-migration-policy.mjs`                                              | Indirect via `pnpm test` in `commit-test-suite` | 0.37            |
| `format:check`                 | Enforce formatting contract                                     | `prettier --check .`                                                                 | Indirect via `pnpm test` in `commit-test-suite` | 1.72            |
| `lint`                         | Static lint + policy rules, including commit-stage test hygiene | `eslint.config.mjs` + `turbo run lint`                                               | Indirect via `pnpm test` in `commit-test-suite` | 1.00            |
| `typecheck:refs`               | Root TS project-reference build graph validation                | `tsc -b --pretty false`                                                              | Indirect via `pnpm test` in `commit-test-suite` | 0.42            |
| `typecheck`                    | Per-package type safety checks                                  | `turbo run typecheck`                                                                | Indirect via `pnpm test` in `commit-test-suite` | 1.01            |
| `test:unit`                    | Unit/component tests + pipeline contract tests                  | `turbo run test && pnpm test:pipeline-contract`                                      | Indirect via `pnpm test` in `commit-test-suite` | 3.51            |
| `contract:check`               | Generated contract drift guard                                  | `pnpm contract:generate && git diff --exit-code ...`                                 | Indirect via `pnpm test` in `commit-test-suite` | 1.34            |

### Local vs CI differences (important)

1. Local `test:quick` always runs all checks regardless of scope.
2. CI `commit-test-suite` is scope-gated by `determine-scope` in [commit-stage.yml](/Users/justinkropp/.codex/worktrees/9faf/compass/.github/workflows/commit-stage.yml).
3. CI adds `ci:smoke:system` after `pnpm test` (`ci:commit-test-suite`), which is not in local quick.
4. CI has extra infra/identity dedicated static jobs and final decision logic with SLO enforcement.

## 3) Runtime and Determinism Profiling

Measurement artifacts:

- `.artifacts/local-metrics/test-quick-subcommand-timing-3runs.tsv`
- `.artifacts/local-metrics/test-quick-full-timing.tsv`

### Subcommand timing summary (3 warm runs)

| Check                          | Avg (s) | Min (s) | Max (s) | Range (s) | Share of total avg |
| ------------------------------ | ------: | ------: | ------: | --------: | -----------------: |
| `test:unit`                    |    3.51 |    3.35 |    3.60 |      0.25 |              31.9% |
| `format:check`                 |    1.72 |    1.69 |    1.76 |      0.07 |              15.6% |
| `contract:check`               |    1.34 |    1.30 |    1.39 |      0.09 |              12.1% |
| `typecheck`                    |    1.01 |    0.95 |    1.09 |      0.14 |               9.2% |
| `lint`                         |    1.00 |    0.99 |    1.03 |      0.04 |               9.1% |
| `ci:terminology-policy`        |    0.46 |    0.43 |    0.50 |      0.07 |               4.2% |
| `typecheck:refs`               |    0.42 |    0.41 |    0.43 |      0.02 |               3.8% |
| `ci:high-risk-mainline-policy` |    0.40 |    0.38 |    0.43 |      0.05 |               3.6% |
| `ci:testing-policy`            |    0.40 |    0.40 |    0.41 |      0.01 |               3.7% |
| `ci:service-bus-auth-contract` |    0.39 |    0.39 |    0.40 |      0.01 |               3.6% |
| `db:migrate:check`             |    0.37 |    0.36 |    0.38 |      0.02 |               3.4% |

### Full `test:quick` timing (5 runs)

| Runs | Avg (s) | Min (s) | Max (s) | Range (s) |
| ---: | ------: | ------: | ------: | --------: |
|    5 |   10.99 |   10.09 |   12.38 |      2.29 |

Interpretation:

1. Warm quick-gate runtime is already low for a trunk gate.
2. The first run accounts for most variability; subsequent runs cluster around ~10.1-11.6s.
3. Runtime profile is stable enough for deterministic developer feedback.

### Determinism log

Across 5 unchanged-input `test:quick` runs:

1. Exit code stable (`0/0/0/0/0`).
2. All key pass markers repeated (`HR001`, `TC policy`, terminology, service-bus contract, migration policy, lint/typecheck/test/pipeline-contract/contract checks).
3. No flaky outcomes observed.

Determinism classification: **stable**.

### Failure UX audit (representative)

| Check                          | Sample failure path                        | Actionability assessment                                                                                           |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `ci:high-risk-mainline-policy` | Simulated `HIGH_RISK_MAINLINE_PR_REQUIRED` | Excellent: reason code, matched files, rationale, explicit PR commands, CODEOWNER guidance.                        |
| `ci:testing-policy`            | Missing `TEST_POLICY_PATH`                 | Good for config failures; violation-path formatter is strong (rule ID, why, fix, docs).                            |
| `ci:terminology-policy`        | Missing policy path                        | Weak: raw Node stack trace on missing file; should emit structured user-level error.                               |
| `contract:check`               | Drift path (by design)                     | Medium: enforcement is strong, but failure message is generic (`git diff --exit-code`) and can be more actionable. |

## 4) Risk Coverage and Redundancy Matrix

| Check                          | Unique risk covered                               | Overlap                                                | Replacement candidate                                                    | Confidence |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ | ---------- |
| `ci:high-risk-mainline-policy` | Prevents risky direct-to-main mutations           | None meaningful                                        | None                                                                     | High       |
| `ci:testing-policy`            | Test-layer policy contract (`TC001/010/011/020`)  | Some overlap with ESLint focused-test and import rules | Keep as canonical policy gate                                            | High       |
| `ci:terminology-policy`        | Language governance consistency                   | Low overlap with lint/docs drift                       | Move to dedicated CI governance check                                    | Medium     |
| `ci:service-bus-auth-contract` | Prevents insecure auth regression patterns        | Minimal overlap                                        | None                                                                     | High       |
| `db:migrate:check`             | Migration policy + checksum drift                 | None meaningful                                        | None                                                                     | High       |
| `format:check`                 | Global formatting consistency                     | Partial overlap with lint-staged local formatting      | Keep in quick for fail-closed consistency                                | Medium     |
| `lint`                         | Static quality + deterministic test hygiene rules | Partial overlap with testing-policy                    | Keep; reduce duplicate messages over time                                | High       |
| `typecheck:refs`               | Root TS reference graph validation                | High overlap with `typecheck`                          | Keep for now; evaluate merge after dedicated graph contract check exists | Medium     |
| `typecheck`                    | Package-level type safety                         | Partial overlap with `typecheck:refs`                  | Primary type safety gate                                                 | High       |
| `test:unit`                    | Behavior correctness + pipeline contract tests    | None meaningful                                        | None                                                                     | High       |
| `contract:check`               | API/SDK generated contract drift guard            | None meaningful                                        | Keep, improve failure UX                                                 | High       |

## 5) Farley Scoring and Decisions

Scoring dimensions (1-5 each):

1. Earliest useful feedback
2. Deterministic pass/fail
3. Cost-to-signal
4. Commit-stage relevance
5. Evidence/actionability
6. Trunk safety impact

| Check                          | Total (/30) | Decision           | Rationale                                                                     |
| ------------------------------ | ----------: | ------------------ | ----------------------------------------------------------------------------- |
| `ci:high-risk-mainline-policy` |          29 | Keep               | Strong trunk safety; near-zero cost; excellent remediation UX.                |
| `ci:testing-policy`            |          30 | Keep               | Core commit-stage policy evidence; low cost; explicit rule contracts.         |
| `ci:terminology-policy`        |          21 | Move               | Good governance signal but lower release-safety relevance for quick gate.     |
| `ci:service-bus-auth-contract` |          27 | Keep               | Security/safety critical, cheap, deterministic.                               |
| `db:migrate:check`             |          28 | Keep               | Critical data safety contract, cheap and deterministic.                       |
| `format:check`                 |          19 | Keep               | Hygiene signal, moderate cost, still valuable for fail-closed consistency.    |
| `lint`                         |          26 | Keep               | High safety signal and broad static coverage.                                 |
| `typecheck:refs`               |          21 | Keep (provisional) | Likely overlap, but retain until reference-graph contract replacement exists. |
| `typecheck`                    |          27 | Keep               | Core static correctness gate.                                                 |
| `test:unit`                    |          25 | Keep               | Primary behavior evidence; largest cost but highest value.                    |
| `contract:check`               |          25 | Keep               | High-value drift protection; UX can improve.                                  |

## 6) Proposed vNext Command Contract

### Target quick gate

```bash
pnpm ci:high-risk-mainline-policy \
  && pnpm ci:testing-policy \
  && pnpm ci:service-bus-auth-contract \
  && pnpm db:migrate:check \
  && pnpm format:check \
  && pnpm lint \
  && pnpm typecheck:refs \
  && pnpm typecheck \
  && pnpm test:unit \
  && pnpm contract:check
```

Change from baseline: remove `ci:terminology-policy` from quick.

### Enforcement relocation

1. Add dedicated required CI check: `terminology-policy` in commit-stage workflow.
2. Keep it fail-closed in CI so governance coverage is retained.

Expected runtime impact (quick local):

- New average estimate: `10.99s - 0.46s = 10.53s` (~4.2% faster)

### `test:full` posture

Keep current `test:full` behavior (preflight -> quick -> integration -> e2e). No change required for this assessment.

## 7) Documentation Contract Wording (vNext)

For [README.md](/Users/justinkropp/.codex/worktrees/9faf/compass/README.md), [AGENTS.md](/Users/justinkropp/.codex/worktrees/9faf/compass/AGENTS.md), [tests/README.md](/Users/justinkropp/.codex/worktrees/9faf/compass/tests/README.md):

1. `pnpm test:quick`: "release-safety quick gate (policy + static + unit + contract drift)."
2. `pnpm test:full`: "quick gate plus integration and e2e evidence."
3. Clarify that terminology governance is a dedicated required CI check.

## 8) Implementation-Ready Change Plan (Small Batches)

### Batch 1: Add dedicated CI terminology check

Changes:

1. Add `terminology-policy` job to [commit-stage.yml](/Users/justinkropp/.codex/worktrees/9faf/compass/.github/workflows/commit-stage.yml).
2. Include it in `commit-stage` decision input map (`CHECK_RESULTS_JSON`).
3. Update policy contract at [.github/policy/pipeline-policy.json](/Users/justinkropp/.codex/worktrees/9faf/compass/.github/policy/pipeline-policy.json) required checks.
4. Update decision script tests for commit-stage decision behavior.

Verify:

1. `pnpm test:pipeline-contract`
2. `pnpm test:quick`

Rollback:

1. Revert workflow and policy contract changes as one commit.

### Batch 2: Remove terminology from local quick chain

Changes:

1. Update `test:quick` in [package.json](/Users/justinkropp/.codex/worktrees/9faf/compass/package.json).
2. Keep `pnpm test` alias unchanged.

Verify:

1. `pnpm test:quick`
2. `pnpm test:full`

Rollback:

1. Restore previous `test:quick` chain.

### Batch 3: Improve contract drift failure UX

Changes:

1. Replace raw `git diff --exit-code` surfacing with wrapper script emitting explicit reason code and fix steps.
2. Keep behavior fail-closed.

Verify:

1. `pnpm contract:check`
2. `pnpm test:quick`

Rollback:

1. Restore prior `contract:check` command string.

### Batch 4: Improve terminology policy config-error UX

Changes:

1. Add top-level error handling in `check-terminology-policy.mjs` to avoid raw stack traces.
2. Emit concise actionable message with policy path and fix guidance.

Verify:

1. `pnpm ci:terminology-policy`
2. Simulate missing policy path and confirm clean error output.

Rollback:

1. Revert script to prior implementation.

## 9) Acceptance Checklist

1. Every quick sub-check has explicit Keep/Move/Merge/Remove decision and rationale.
2. vNext quick contract is defined with expected runtime impact.
3. CI coverage for moved checks remains fail-closed.
4. Docs describe only the two-command developer model clearly.
5. Pipeline contract tests and quick/full gates pass after changes.

## 10) Assumptions and Defaults

1. Trunk-wide quick gate remains the policy target.
2. Two-command developer interface (`test:quick`, `test:full`) remains fixed.
3. Flakes in required quick checks are defects.
4. Commit-stage SLO policy remains authoritative.
5. Coverage is judged on release-safety impact first, governance second.
