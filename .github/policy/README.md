# Merge Policy Contract

This directory is the machine source of truth for merge control.

- Canonical contract: `.github/policy/merge-policy.json`
- Enforced by workflow: `.github/workflows/merge-contract.yml`
- Final required branch-protection check: `risk-policy-gate`

`risk-policy-gate` enforces tier-specific evidence, docs-drift, and stale SHA rules for the current PR head.

## Bootstrap Toggle

`reviewPolicy.codexReviewEnabled` controls whether `codex-review` is part of required checks.

- `false`: `codex-review` stays wired but writes deterministic no-op artifacts.
- `true`: policy-required tiers enforce full blocking `codex-review`.

To enable full review enforcement:

1. Add repo secret `OPENAI_API_KEY`.
2. Set `reviewPolicy.codexReviewEnabled` to `true` in `.github/policy/merge-policy.json`.
