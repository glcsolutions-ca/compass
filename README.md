# Compass by GLC

One place to see work, time, and delivery across your company.

## Quick Start

Requirements:

- Node.js `24.x` (from `.nvmrc`; enforced by `engines >=24.8.0 <25`)
- pnpm `10.30.1`

```bash
pnpm install
pnpm dev
```

## Doorway

- Contributor workflow: `CONTRIBUTING.md`
- Agent table of contents: `AGENTS.md`
- Merge policy (human): `docs/merge-policy.md`
- Branch protection setup: `docs/branch-protection.md`
- Merge policy (machine): `.github/policy/merge-policy.json`
- CI enforcement workflow: `.github/workflows/merge-contract.yml`

## Source of Truth

CI is authoritative for merge safety.
Local scripts are optional convenience for faster feedback.

Common local checks:

```bash
pnpm check
pnpm build
```
