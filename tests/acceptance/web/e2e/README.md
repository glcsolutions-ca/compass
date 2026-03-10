# Web Acceptance Tests

Purpose: browser acceptance coverage for the core Compass product flows.

## Run

```bash
pnpm test:acceptance:web
```

The root command is self-sufficient. It brings up the required local stack when needed, never opens
a browser window, and reuses a healthy `pnpm dev:up` stack when one is already running.

## Source Of Truth

- `tests/acceptance/web/e2e/auth-gateway.spec.ts`
- `tests/acceptance/web/e2e/chat-surface.spec.ts`
- `tests/acceptance/web/e2e/thread-lifecycle.spec.ts`
- `tests/acceptance/web/e2e/chat-layout.spec.ts`
- `tests/acceptance/web/e2e/playwright.config.ts`
