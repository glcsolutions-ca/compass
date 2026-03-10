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
$EDITOR apps/web/app/...test.tsx

# 3. Prove the failure with the narrowest command
pnpm --filter @compass/web test

# 4. Make the minimal code change to get green
$EDITOR apps/web/app/...

# 5. Re-run the smallest relevant test
pnpm --filter @compass/web test

# 6. Run the local Commit Stage before integration
pnpm verify

# 7. Integrate in one of two supported ways
# Direct path:
git push origin HEAD:main

# PR path:
git push -u origin HEAD
gh pr create --base main

# 8. If using a PR, wait for Verify and squash merge once the branch is current
gh pr merge --squash
```

## Common commands

```bash
# Default local app
pnpm dev

# Canonical pre-integration gate
pnpm verify

# Local Acceptance Stage against the local candidate
pnpm acceptance

# Web unit tests
pnpm --filter @compass/web test

# API unit tests
pnpm --filter @compass/api test

# API integration tests
pnpm --filter @compass/api test:integration
```

## Mental model

```bash
# red -> green -> refactor -> pnpm verify -> integrate -> watch CDP
```
