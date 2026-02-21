# Contributing

This repo treats CI as the source of truth for merge safety.

## Start Here

- Human policy: `docs/merge-policy.md`
- Machine policy: `.github/policy/merge-policy.json`
- CI workflow: `.github/workflows/merge-contract.yml`

## Prerequisites

- Node.js `24.x` (`.nvmrc`; enforced range `>=24.8.0 <25`)
- `pnpm` (`packageManager` pinned in `package.json`)

## Local Workflow (Convenience)

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```

Use `pnpm clean` when needed.

## CI Merge Contract

CI runs deterministic ordered checks and fails closed at `risk-policy-gate`.
Branch protection should require only `risk-policy-gate`.

`codex-review` enforcement is controlled by `reviewPolicy.codexReviewEnabled` in `.github/policy/merge-policy.json`.

## PR Checklist

- [ ] Local convenience checks pass (`pnpm check`, `pnpm build`).
- [ ] Control-plane edits also update policy/docs where required.
- [ ] No unrelated files or generated noise are included.
