# E2E Browser Evidence

## Scope

`tests/e2e/` contains Playwright browser smoke evidence for the web baseline flow.

## Run Command

```bash
pnpm test:e2e
```

Equivalent direct command:

```bash
playwright test tests/e2e/smoke.spec.ts --config tests/e2e/playwright.config.ts --reporter=line --workers=1
```

## Environment Variables

### Optional (defaults provided)

- `WEB_BASE_URL` (default `http://127.0.0.1:3000`)
- `REQUIRED_FLOW_IDS_JSON` (JSON array override for required flow IDs)
- `EVIDENCE_FLOW_ID` (fallback comma-separated flow ID list, default `compass-smoke`)
- `EXPECTED_ENTRYPOINT` (default `/`)
- `HEAD_SHA` (default `local`)
- `TESTED_SHA` (default `HEAD_SHA`)
- `RISK_TIER` (default `standard`)
- `PR_NUMBER` (default `0`)

### Required

No variable is strictly required for local execution, but CI normally supplies SHA/tier metadata for evidence traceability.

## Output Artifact

Primary artifact:

- `.artifacts/browser-evidence/<sha>/manifest.json`

Related screenshots:

- `.artifacts/browser-evidence/<sha>/<flow-id>.png`
