# Workflows

GitHub Actions workflows for this repository.

- `ci.yml`: runs on pull requests and pushes to `main` (plus manual dispatch), installs dependencies, runs `pnpm check:format`, `pnpm check:lint`, `pnpm check:typecheck`, `pnpm check:test`, and `pnpm check:contract`, then validates production build output with `pnpm build`.
