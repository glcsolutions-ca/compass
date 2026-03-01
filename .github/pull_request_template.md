## Summary of Change

Describe what changed and where.

## Why This Change

Explain the problem and why this approach was chosen.

## Testing Evidence

List the commands you ran and any important outputs.

## Commit Stage Evidence (If Applicable)

- Change class:
- Commit scope artifact path:
- Docs-drift artifact path:
- Testing policy artifact path:
- Commit-stage gate artifact path:

## Baseline Checklist

- [ ] `pnpm check` passes locally.
- [ ] `pnpm build` passes locally.
- [ ] Naming and import conventions match the baseline.
- [ ] Frontend constitution rules are followed for web changes (`docs/architecture/frontend-constitution.md`).
- [ ] Web route modules use `clientLoader`/`clientAction` in `ssr:false` mode (no `loader`/`action` exports).
- [ ] Web route modules do not use raw `fetch`, route-to-route imports, or parent-relative route imports.
- [ ] Web route structure matches v2 (`app/routes/root-redirect`, `public/login`, `app/layout`, `app/workspaces`, `app/chat`).
- [ ] Auth shell navigation follows sidebar standard (shadcn sidebar primitives + sidebar footer profile/workspace controls).
- [ ] Theme and component changes use shadcn tokens/primitives (`app/app.css`, `app/components/ui`).
- [ ] Contract artifacts are generated and committed when schemas change (`pnpm contract:check`).
- [ ] If deployment-pipeline-config files changed, pipeline docs were updated (`docs/development-pipeline.md`, `docs/commit-stage-policy.md`, and `.github/workflows/README.md`).
- [ ] No unrelated files or generated noise are included.

## Risk and Rollback

- Risk level:
- Rollback plan:
