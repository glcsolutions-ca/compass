# Contributing

This repository is agent-first. Merge safety is enforced in CI by `risk-policy-gate`.

## Root Doorway

- `README.md`: project overview and baseline commands.
- `AGENTS.md`: agent navigation and operating docs.
- `CONTRIBUTING.md`: required contribution and validation flow.

## Prerequisites

- Node.js `24.13.1` (`.nvmrc`)
- `pnpm` (`packageManager` pinned in `package.json`)

## Daily Workflow

```bash
pnpm install
pnpm dev
```

Use `pnpm clean` when you need to clear generated artifacts.

## Required Local Validation

Run before opening/updating a PR:

```bash
pnpm check
pnpm build
```

## Deterministic Merge Contract Flow

CI order is fixed:

1. `preflight`
2. `docs-drift`
3. `codex-review`
4. `ci-pipeline`
5. `browser-evidence` (policy conditional)
6. `harness-smoke` (policy conditional)
7. `risk-policy-gate` (final required check)

`risk-policy-gate` fails closed on missing/stale/invalid evidence and enforces current head SHA discipline.

`codex-review` behavior is controlled by `reviewPolicy.codexReviewEnabled` in `.github/policy/merge-policy.json`.
Set it to `true` (with `OPENAI_API_KEY` configured) to enforce full blocking review for policy-required tiers.

## Merge Contract Commands

```bash
pnpm ci:preflight
pnpm ci:docs-drift
pnpm ci:codex-review
pnpm ci:pipeline
pnpm ci:browser-evidence
pnpm ci:harness-smoke
pnpm ci:gate
pnpm test:merge-contract
```

## Contract and Policy Paths

- Merge policy contract: `.github/policy/merge-policy.json`
- Policy docs: `docs/merge-policy.md`
- Branch protection docs: `docs/branch-protection.md`
- Workflow docs: `.github/workflows/README.md`
- Agent docs index: `docs/agents/README.md`

## PR Checklist

- [ ] `pnpm check` passes locally.
- [ ] `pnpm build` passes locally.
- [ ] Merge-contract commands are used when changing control-plane surfaces.
- [ ] If control-plane files changed, docs were updated (`docs/merge-policy.md` and `.github/workflows/README.md`).
- [ ] No unrelated files or generated noise are included.
