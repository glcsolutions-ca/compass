# Contributing

## Prerequisites

- Node.js 24.13.1 (`.nvmrc`)
- `pnpm` (`packageManager` is pinned in `package.json`)
- One-time toolchain baseline only; no recurring update automation is configured yet.

## Daily Workflow

```bash
pnpm install
pnpm dev
```

- Use `pnpm clean` when you need to clear generated artifacts (`dist`, `dist-types`, `.next`, `.turbo`, coverage, and `*.tsbuildinfo`).

## Required Gates

- Before opening or updating a PR, run:

```bash
pnpm check
```

- CI runs:
  - `pnpm check:format`
  - `pnpm check:lint`
  - `pnpm check:typecheck`
  - `pnpm check:test`
  - `pnpm check:contract`
  - `pnpm build`

## Baseline Conventions

- Use `kebab-case` for filenames.
- Use `PascalCase` for interfaces, types, classes, and enums.
- Use `camelCase` for functions, methods, variables, and properties.
- Co-locate tests with source files as `*.test.ts`.
- In NodeNext workspaces, use `.js` extensions for relative imports in TypeScript source.
- Keep import boundaries strict:
  - Relative imports within a package/app.
  - Package-root imports across boundaries (for example `@compass/contracts`).
  - No deep imports from `@compass/*/src/*` or `@compass/*/dist/*`.

## TypeScript Config Split

- `tsconfig.ref.json`: reference graph and declaration-only outputs for solution builds.
- `tsconfig.build.json`: runtime build output to `dist` (excluding tests where configured).

## Generated Artifacts

- Keep these committed and in sync:
  - `packages/contracts/openapi/openapi.json`
  - `packages/sdk/src/generated/schema.ts`
- Validate artifact drift with:

```bash
pnpm contract:check
```

## PR Checklist

- [ ] `pnpm check` passes locally.
- [ ] `pnpm build` passes locally.
- [ ] Naming/import conventions follow baseline rules.
- [ ] Contract artifacts are generated and committed if schemas changed.
- [ ] No unrelated files or generated noise are included in the PR.
