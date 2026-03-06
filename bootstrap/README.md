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
4. run `pnpm bootstrap:ghcr`
5. run `pnpm infra:apply`
6. run `pnpm bootstrap:keyvault:seed`
7. merge the first release-producing revision to `main`
8. run `pnpm bootstrap:apps -- --candidate-id sha-<commit>`
9. discover the stage web ACA FQDN
10. rerun `pnpm bootstrap:entra -- --stage-web-fqdn <fqdn>`
11. run `pnpm bootstrap:web-domain`

## Notes

- `ensure-entra-apps.mjs --reset-web-client-secret` writes the generated web client secret to `bootstrap/.artifacts/entra-apps.json` so it can be seeded into Key Vault.
- `bootstrap/.artifacts` is local-only and ignored by git.
