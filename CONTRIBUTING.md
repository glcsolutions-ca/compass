# Contributing

We use **trunk-first Continuous Delivery (Dave Farley style)**: keep `main` **green and releasable**.  
Make changes **small, testable, and reversible**. CI stage gates are the source of truth.

## Prereqs

- Node.js `22.x` (see `.nvmrc`, enforced by `engines`)
- `pnpm` `10.30.1` (see `packageManager`)
- Docker (only for local Postgres)

## Quick start

```bash
pnpm install
pnpm db:postgres:up   # optional (API/data work)
pnpm dev
```
