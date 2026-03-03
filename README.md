# Compass

Purpose: one place to manage work, time, and delivery across the company.

## Quick Start

Requirements:

- Node.js `22.x`
- `pnpm 10.30.1`
- Docker (local Postgres)

```bash
pnpm install
pnpm db:postgres:up
pnpm runtime:session:up
pnpm dev
```

## Run And Test

```bash
pnpm test:quick
pnpm test:full
pnpm build
```
