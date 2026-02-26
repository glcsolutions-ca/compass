# Frontend Constitution v1

## Purpose

Define the non-negotiable implementation contract for `apps/web` so the frontend remains polished, consistent, and maintainable from day one.

## Scope

- React Router 7 web frontend in `apps/web`
- Authenticated shell and workspace switching UX
- Route/module boundaries
- Theming and component system standards

## Constitution Rules

1. **Data APIs only**
   - Route data and mutations must use React Router data APIs (`clientLoader`, `clientAction`, `useNavigation`, `useFetcher`).
2. **SDK-only Compass API access**
   - Route modules and components must not call raw `fetch` for Compass API routes.
   - Use `@compass/sdk` via `apps/web/app/lib/api/compass-client.ts`.
3. **Component primitives policy**
   - Use shadcn/Radix primitives as the base layer.
   - Do not introduce bespoke base `Button`, `Input`, `Dialog`, `Dropdown` primitives.
4. **Styling policy**
   - Tailwind utility classes + shadcn CSS variables are required.
   - Global theme tokens live in `app/styles/globals.css`.
5. **Theme policy**
   - Light and dark mode are required.
   - Theme persists in local storage and must initialize before hydration flash.
6. **Workspace context authority**
   - Active workspace context is URL-driven (`/t/:tenantSlug/*`).
   - Workspace switching must rewrite URL tenant slug rather than hidden local-only context.
7. **Persistent authenticated shell**
   - All authenticated routes render a common shell.
   - Profile menu is anchored bottom-right and includes workspace switch + theme toggle + sign-out.
8. **Route-first capsules**
   - Each route lives in a route capsule folder (`route.tsx`, `loader.ts`, `action.ts`, `view.tsx`, plus optional `meta.ts`/`schema.ts`).
9. **Boundary hygiene**
   - Route files must not import from other route capsules using parent-relative imports.
   - Shared logic belongs in `app/lib` or `app/shell`.
10. **Fail-closed enforcement**
    - Constitution drift must fail the quick gate via `ci:web-constitution-policy`.

## Canonical Structure

```text
apps/web/app/
  shell/
  ui/shadcn/
  ui/icons/
  lib/api/
  lib/auth/
  lib/workspace/
  styles/globals.css
  routes/public.login/
  routes/app.root/
  routes/app.workspaces/
  routes/app.t.$tenantSlug.chat/
```

## Route Contract v1

- `/` -> login route
- `/login` -> login route
- `/workspaces` -> authenticated workspace selection/create/invite flow
- `/t/:tenantSlug/chat` -> authenticated tenant-scoped chat shell route

## Enforcement

- ESLint route import restrictions in `eslint.config.mjs`
- Constitution checks in `scripts/pipeline/commit/check-web-constitution.mjs`
- Quick gate wiring in root `package.json` (`test:quick`)
- PR checklist requirements in `.github/pull_request_template.md`
