# Console Contract Steering (CCS)

## What this is

**Console Contract Steering (CCS)** is our approach for guiding AI agents (and humans) with deterministic runtime feedback instead of long upfront instructions.

We keep written guidance lightweight and rely on guardrail scripts that:

- run predictably,
- fail fast,
- and print structured corrective instructions on failure.

**The console is the steering interface.**  
The scripts define the contract; stdout/stderr teaches the next move.

---

## Why we do this

Upfront prompt rules are:

- token-expensive,
- brittle,
- and model-specific.

CCS is:

- **token-efficient** (minimal instruction payload),
- **robust** (rules enforced by code, not memory),
- **future-proof** (as models improve, fewer corrections are needed, but the contract remains stable),
- **auditable** (behavior is encoded in scripts + logs).

---

## The CCS contract

### For agents (non-negotiable)

1. Use the project's guardrail commands as the source of truth.
2. If a guardrail fails, do not bypass it. Follow the printed fix steps.
3. Prefer small, reversible changes and re-run the guardrail loop.
4. When uncertain, re-run the guardrail that failed and follow its output literally.

### For maintainers

Guardrails are an API. Treat their output as a stable interface:

- Keep output predictable and structured.
- Always provide the next action (exact commands).
- Avoid relying on flaky external services for release-blocking guardrails.
- Version or explicitly label breaking changes to output format.

---

## Output format (the "console contract")

Guardrails must emit a single, stable header and a minimal set of fields.

### PASS

- Exit code: `0`
- Output (example):
  - `CCS:PASS <guardrail_id>`

### FAIL

- Exit code: non-zero
- Output must include:
  - `CCS:FAIL <guardrail_id>`
  - `WHY:` one-line cause (what violated the contract)
  - `FIX:` one-line intent (what must be true)
  - `DO:` exact commands to run (copy/paste ready)
  - `REF:` optional pointer to docs in-repo

Example:

```text
CCS:FAIL trunk.green
WHY: main is behind origin/main (non-fast-forward risk)
FIX: rebase onto origin/main before making changes
DO:
git checkout main
git fetch origin
git pull --rebase origin main
<FAST_CHECK_CMD>
REF: docs/ccs.md#trunk
```

---

## Patterns we use

### 1) Guardrails over prose

Instead of listing every rule in `AGENTS.md`, we encode the rule in a script and let failures explain what to do.

### 2) Steer-by-stdout

When an agent runs a command, it watches stdout/stderr.  
We take advantage of that by making failures instructional and unambiguous.

### 3) Wrap the workflows the agent naturally runs

Prefer guardrails that sit on the hot path:

- `pre-push` / `pre-commit`
- `./dev`, `./check`, `./test`, `./verify`, `./release`
- CI gates (as the backstop)

The best guardrail is the one the agent will run anyway.

---

## What belongs in guardrails vs docs

### Guardrails (runtime-enforced)

- "Must be true" conditions (formatting, tests, policy, structure)
- Branch/merge constraints
- Release evidence requirements
- Safety constraints (no secrets, no forbidden files, etc.)

### Docs (lightweight)

- Purpose + philosophy
- How to run the canonical commands
- Where to find logs/artifacts
- Glossary (minimal)

If a rule can be deterministically checked, prefer a guardrail.

---

## Minimal agent directive (if you only write one line)

**"Follow CCS: run the guardrails; if they fail, do exactly what the console says until green."**

---

## Notes

- CCS is not "less strict." It's strict in code and light in text.
- The goal is not to micromanage the agent. It's to shape the environment so correct behavior is the easiest behavior.
