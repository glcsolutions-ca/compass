# Branch Protection Baseline

Configure branch protection for `main` with one required status check:

- `risk-policy-gate`

Do not require dynamic checks directly (`ci-pipeline`, `browser-evidence`, `harness-smoke`, `codex-review`).

Those are tier-conditional and enforced by `risk-policy-gate` using `.github/policy/merge-policy.json`.

## Why one check

- Branch protection stays static and simple.
- Tier-specific required checks remain policy-driven.
- Stale SHA/tier evidence is rejected centrally.
