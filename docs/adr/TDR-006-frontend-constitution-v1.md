# TDR-006: Frontend Constitution v2 Cutover (RR7 Standard)

## Status

Accepted

## Date

2026-02-26

## Context

The previous frontend constitution and route-capsule implementation established guardrails, but diverged from the most standard React Router 7 structure used in framework mode (`app/root.tsx`, `app/routes.ts`, explicit nested route folders, and `clientLoader`/`clientAction` route APIs).

We need a full cutover to a standard RR7 structure with no backward-compatibility layer, while preserving Compass requirements for authenticated shell UX, URL-authoritative workspace context, and shadcn tokenized theming.

## Decision

Adopt Frontend Constitution v2 for `apps/web` and perform a hard cutover with these requirements:

1. Route modules use `clientLoader`/`clientAction` in `ssr:false` SPA mode.
2. Route contract is fixed to `/`, `/login`, `/automations`, `/skills`, `/chat`, `/chat/:threadId`, `/workspaces`.
3. Route entrypoints are single-file `route.tsx` modules under nested `app/routes/**` folders.
4. Domain logic is organized under `app/features/{auth,workspace,chat}`.
5. Shared shell/UI lives under `app/components/{shell,ui,icons}` with a top utility cluster (`New thread`, `Automations`, `Skills`), an action-only profile launcher in sidebar footer, and chat-first navigation with `Workspaces` as management entry.
6. Global theming is tokenized in `app/app.css` with two selectors on `<html>`: mode (`.dark`) and palette (`data-theme`).
7. Theme controls are surfaced in a shared settings modal under `Settings > General` with URL-backed modal state.
8. Chat onboarding is personal-first (`/chat`) with workspace management optional (`/workspaces`).
9. Chat runtime adopts `agent` transport semantics with websocket streaming (`/v1/agent/threads/:threadId/stream`) and `/events` fallback.
10. Chat presentation standard is assistant-ui-first: timeline and composer in assistant-ui, timeline-first execution cards, deep inspect drawer via query-backed `inspect` + `inspectTab`, and assistant-ui thread list in sidebar.
11. `@compass/sdk` remains the only Compass API access path from web route/component code.
12. Legacy v1 folders and compatibility paths are removed completely.
13. Constitution enforcement remains fail-closed in quick gate (`ci:web-constitution-policy`).

## Consequences

### Positive

- Frontend structure aligns with RR7 standard conventions.
- Lower cognitive overhead and cleaner onboarding.
- Stronger route and feature boundaries reduce architecture drift.
- Polished shell/theming baseline is preserved while simplifying implementation shape.

### Tradeoffs

- Hard cutover removes legacy compatibility and requires immediate migration of imports/tests.
- Guardrails are stricter, so non-standard patterns fail faster.

## Implementation Notes

- Normative architecture doc: `docs/architecture/frontend-constitution.md`
- Route config source of truth: `apps/web/app/routes.ts`
- Guardrail script: `scripts/pipeline/commit/check-web-constitution.mjs`
- Quick gate wiring: root `package.json` `test:quick`
- Theme foundation source of truth: `apps/web/app/lib/theme/theme.ts`
