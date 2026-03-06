# Bootstrap

Bootstrap is a manual admin workflow. It creates the control plane and the initial production stack.

## Scripts

- [/Users/justinkropp/.codex/worktrees/2bfd/compass/scripts/bootstrap/ensure-entra-apps.mjs](../scripts/bootstrap/ensure-entra-apps.mjs)
- [/Users/justinkropp/.codex/worktrees/2bfd/compass/scripts/bootstrap/configure-github-repo.mjs](../scripts/bootstrap/configure-github-repo.mjs)
- [/Users/justinkropp/.codex/worktrees/2bfd/compass/scripts/bootstrap/ensure-ghcr-visibility.mjs](../scripts/bootstrap/ensure-ghcr-visibility.mjs)
- [/Users/justinkropp/.codex/worktrees/2bfd/compass/scripts/bootstrap/seed-keyvault-secrets.mjs](../scripts/bootstrap/seed-keyvault-secrets.mjs)
- [/Users/justinkropp/.codex/worktrees/2bfd/compass/scripts/bootstrap/bootstrap-production-apps.mjs](../scripts/bootstrap/bootstrap-production-apps.mjs)
- [/Users/justinkropp/.codex/worktrees/2bfd/compass/scripts/bootstrap/configure-web-domain.mjs](../scripts/bootstrap/configure-web-domain.mjs)

## Sequence

1. create `rg-compass-prd-cc-001`
2. run `pnpm bootstrap:entra -- --reset-web-client-secret`
3. run `pnpm bootstrap:github:apply`
4. set the three runtime GHCR packages to `public` in GitHub:
   - `compass-api`
   - `compass-web`
   - `compass-migrations`
5. optionally set the organization package creation default to `public`
6. run `pnpm bootstrap:ghcr` to verify package visibility
7. run `pnpm infra:apply`
8. run `pnpm bootstrap:keyvault:seed`
9. merge the first release-producing revision to `main`
10. run `pnpm bootstrap:apps -- --candidate-id sha-<commit>`
11. discover the stage web ACA FQDN
12. rerun `pnpm bootstrap:entra -- --stage-web-fqdn <fqdn>`
13. run `pnpm bootstrap:web-domain`

## Notes

- `ensure-entra-apps.mjs --reset-web-client-secret` writes the generated web client secret to `bootstrap/.artifacts/entra-apps.json` so it can be seeded into Key Vault.
- `bootstrap/.artifacts` is local-only and ignored by git.
- GitHub currently exposes container package visibility changes through the UI. The bootstrap path treats public GHCR package visibility as a one-time admin action and verifies it in CI/CD.
