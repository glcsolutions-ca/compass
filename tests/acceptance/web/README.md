# Web Acceptance Tests

Purpose: browser acceptance coverage for the core Compass product flows.

## Run

```bash
pnpm acceptance:web
```

## Source of truth

- `tests/acceptance/web/auth-gateway.spec.ts`
- `tests/acceptance/web/chat-surface.spec.ts`
- `tests/acceptance/web/thread-lifecycle.spec.ts`
- `tests/acceptance/web/chat-layout.spec.ts`
- `tests/acceptance/web/playwright.config.ts`

These suites are black-box user journeys. They interact through the browser and assert
user-observable behavior rather than internal component wiring.
