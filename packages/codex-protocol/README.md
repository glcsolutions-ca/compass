# Codex Protocol Artifacts

This package stores generated Codex app-server protocol artifacts that are pinned to the exact
`codex-cli` version used during generation.

## Generate

```bash
pnpm codex:protocol:generate
```

This command runs:

1. `codex app-server generate-ts`
2. `codex app-server generate-json-schema`

Outputs are written to `generated/<codex-version>/`.

## Contract

1. `codex-version.json` is the manifest source of truth.
2. Generated assets are versioned and committed.
3. CI checks fail if manifest/artifacts are missing.
