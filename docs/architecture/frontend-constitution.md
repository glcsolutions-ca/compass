# Frontend Constitution v2

## Purpose

Define the non-negotiable implementation contract for `apps/web` so the frontend remains polished, consistent, and maintainable from day one.

## Scope

- React Router 7 framework frontend in `apps/web`
- Authenticated shell and workspace switching UX
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
   - Do not introduce bespoke base primitives (`Button`, `Input`, `Dialog`, `Dropdown`, etc.).
   - Do not mix additional component frameworks.

4. **Styling policy**
   - Tailwind utility classes + shadcn CSS variables are required.
   - Global token definitions live in `apps/web/app/app.css`.

5. **Theme policy**
   - Light and dark mode are required from first commit.
   - Theme is class-based on `<html>` and persists across reload.
   - Theme initialization must run pre-hydration to avoid flash.

6. **Workspace context authority**
   - Active workspace context is URL-driven (`/t/:tenantSlug/*`).
   - Workspace switching rewrites tenant slug in URL and preserves path/query/hash when possible.

7. **Persistent authenticated shell**
   - Authenticated routes render a single shared shell layout.
   - Shell includes rail navigation, bottom-right profile menu, theme toggle, workspace switcher, and sign-out.

8. **Route-entrypoints + feature modules**
   - Route entrypoints live in `app/routes/**` with one `route.tsx` per route folder.
   - Domain logic lives in `app/features/**`.
   - Shared UI lives in `app/components/**` and utilities in `app/lib/**`.

9. **Boundary hygiene**
   - Route modules must not import from other route modules.
   - Route modules must not use parent-relative imports.
   - Route modules may import from `~/features/**`, `~/components/**`, and `~/lib/**`.

10. **Fail-closed enforcement**
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
    app/workspaces/route.tsx
    app/chat/route.tsx
```

## Route Contract

- `/` -> auth-aware redirect
- `/login` -> login
- `/workspaces` -> authenticated workspace management
- `/t/:tenantSlug/chat` -> authenticated tenant-scoped chat

## Runtime Constraints

- `react-router.config.ts` remains `ssr: false`.
- The architecture standard is still `clientLoader`/`clientAction` route APIs.
- Backend contracts remain unchanged for this phase.

## Enforcement

- ESLint import and boundary rules in `eslint.config.mjs`
- Constitution policy script in `scripts/pipeline/commit/check-web-constitution.mjs`
- Quick gate wiring in root `package.json` (`test:quick`)
- PR checklist requirements in `.github/pull_request_template.md`
