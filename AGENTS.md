# AGENTS.md

## Repo map

```text
compass/
├─ .github/{actions,workflows,labeler.yml}
├─ apps/{api,web,desktop}
├─ bootstrap/{README.md,config}
├─ docs/{architecture,adr,spikes}
├─ packages/{contracts,database,runtime-agent,runtime-protocol,sdk,testkit,ui}
├─ platform/{infra,pipeline,scripts}
└─ tests/acceptance/{api,desktop,web}
```

## Typical workflow

```bash
# 1. Start from main and create a short-lived branch
git fetch origin main
git switch main
git pull --ff-only origin main
git switch -c feat/small-focused-change

# 2. Write or update the smallest failing test first
# Example: web
$EDITOR apps/web/app/...test.tsx

# 3. Prove the failure with the narrowest command
pnpm --filter @compass/web test

# 4. Make the minimal code change to get green
$EDITOR apps/web/app/...

# 5. Re-run the smallest relevant test
pnpm --filter @compass/web test

# 6. Refactor if needed, then re-run the same focused test
pnpm --filter @compass/web test

# 7. Run local quality gates before push
pnpm lint
pnpm typecheck
pnpm test

# 8. Commit and push
git add .
git commit -m "feat: small focused change"
git push -u origin HEAD

# 9. Open a short-lived PR
gh pr create --base main

# 10. After PR checks are green, enable merge-when-ready / merge queue
gh pr merge --auto
```

## Common commands

```bash
# Web unit tests
pnpm --filter @compass/web test

# API unit tests
pnpm --filter @compass/api test

# API integration tests
pnpm --filter @compass/api test:integration

# Full local gate before push
pnpm test

# Acceptance checks when needed
pnpm test:acceptance
```

## Mental model

```bash
# red -> green -> refactor -> pnpm test -> push -> PR -> gh pr merge --auto
```
