# Frontend Constitution v2

## Purpose

Define the non-negotiable implementation contract for `apps/web` so the frontend remains polished, consistent, and maintainable from day one.

## Scope

- React Router 7 framework frontend in `apps/web`
- Authenticated shell and chat-first onboarding UX
- Route/module boundaries
- Tailwind + shadcn theming standards

## Non-Negotiables

1. **React Router data-first architecture**
   - Route data and mutations must use `clientLoader` and `clientAction` APIs.
   - Use `Form`, `useFetcher`, and `useNavigation` for mutations and pending UI.
   - `loader` and `action` exports are not allowed in `ssr: false` SPA mode.

2. **SDK-only Compass API access**
   - Route modules and components must not call raw `fetch` for Compass API routes.
   - Use `@compass/sdk` via `apps/web/app/lib/api/compass-client.ts`.

3. **Component primitives policy**
   - Use shadcn + Radix primitives as the base layer.
   - Chat timeline/composer/thread-list surfaces must prefer assistant-ui primitives (`Thread`, `ComposerPrimitive`, `ThreadList`) layered with shadcn tokens.
   - Do not introduce bespoke base primitives (`Button`, `Input`, `Dialog`, `Dropdown`, etc.).
   - Do not mix additional component frameworks.

4. **Styling policy**
   - Tailwind utility classes + shadcn CSS variables are required.
   - Global token definitions live in `apps/web/app/app.css`.

5. **Theme policy**
   - Light and dark mode are required from first commit.
   - Color mode is class-based on `<html>` (`.dark`) and persists across reload.
   - Palette is selected via `<html data-theme=\"<themeId>\">` and persists across reload.
   - Theme initialization must run pre-hydration to avoid flash.

6. **Chat-first onboarding authority**
   - Authenticated users must land directly in `/chat`.
   - Workspace membership must not be a prerequisite for chat access.
   - Workspace management remains available at `/workspaces` as an optional collaboration flow.
   - Thread deep-linking must be first class via `/chat/:threadId`.

7. **Persistent authenticated shell**
   - Authenticated routes render a single shared shell layout.
   - Shell includes a top utility cluster with `New thread`, `Automations`, and `Skills`.
   - Shell includes rail navigation, `Workspaces` management entry, and sidebar footer account launcher.
   - Profile menu exposes `Settings` and `Personalization`, both opening one shared settings modal.
   - Profile launcher is action-only (`Personalization`, `Settings`, `Help`, `Log out`) with no workspace rows.
   - Theme controls live in `Settings > General`, not directly in the profile dropdown.
   - Settings modal state is URL-backed via `?modal=settings&section=general|personalization`.
   - Sidebar exposes recent thread history for quick deep-link navigation.

8. **Agent chat runtime contract**
   - Chat UI must consume the agent-thread contract (`/v1/agent/threads*`) through `app/features/chat`.
   - Live transport must use websocket stream (`/v1/agent/threads/:threadId/stream`) with `/events` reconciliation fallback.
   - Chat surface must be immersive and full-screen with no route-level header/card framing.
   - Timeline, welcome state, runtime event cards, and composer must share one centered canonical width contract.
   - Chat timeline rendering must normalize agent events and fail-open for unknown methods.
   - Execution/runtime signals are timeline-first and inline; deep event details open in a right inspect drawer.
   - Composer remains docked at the bottom of the timeline as the primary interaction control.
   - Inspect drawer URL state is query-backed via `inspect` and `inspectTab`.

9. **Route-entrypoints + feature modules**
   - Route entrypoints live in `app/routes/**` with one `route.tsx` per route folder.
   - Domain logic lives in `app/features/**`.
   - Shared UI lives in `app/components/**` and utilities in `app/lib/**`.

10. **Boundary hygiene**
    - Route modules must not import from other route modules.
    - Route modules must not use parent-relative imports.
    - Route modules may import from `~/features/**`, `~/components/**`, and `~/lib/**`.

11. **Fail-closed enforcement**
    - Constitution drift must fail the quick gate via `ci:web-constitution-policy`.

## Canonical Structure

```text
apps/web/app/
  app.css
  root.tsx
  routes.ts

  components/
    ui/
    icons/
    shell/

  features/
    auth/
    workspace/
    chat/

  lib/
    api/
    auth/
    utils/

  routes/
    root-redirect/route.tsx
    public/login/route.tsx
    app/layout/route.tsx
    app/automations/route.tsx
    app/skills/route.tsx
    app/workspaces/route.tsx
    app/chat/route.tsx
```

## Route Contract

- `/` -> auth-aware redirect
- `/login` -> login
- `/automations` -> authenticated automations placeholder
- `/skills` -> authenticated skills placeholder
- `/workspaces` -> authenticated workspace management
- `/chat` -> authenticated personal chat
- `/chat/:threadId` -> authenticated chat thread deep-link

## Runtime Constraints

- `react-router.config.ts` remains `ssr: false`.
- The architecture standard is still `clientLoader`/`clientAction` route APIs.
- Backend contracts remain unchanged for this phase.

## Enforcement

- ESLint import and boundary rules in `eslint.config.mjs`
- Constitution policy script in `scripts/pipeline/commit/check-web-constitution.mjs`
- Quick gate wiring in root `package.json` (`test:quick`)
- PR checklist requirements in `.github/pull_request_template.md`
