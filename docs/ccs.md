# Console Contract Steering (CCS)

Purpose: keep terminal interactions deterministic, auditable, and policy-aligned.

## Core Rules

- treat pipeline policy and workflows as operational truth
- prefer explicit command/output evidence over narrative claims
- block risky operations when trunk safety would be reduced

## Common Failure Signals

- `trunk.green` failures (branch behind or non-fast-forward risk)
- docs drift and policy drift signals
- missing test evidence for claimed behavior changes

## Operator Response

1. correct branch state (`git pull --rebase`)
2. rerun required checks
3. continue only with green evidence
