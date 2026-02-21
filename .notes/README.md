# Requirements

This folder contains the evolving requirements for the next iteration of the tool.

## How This Folder Is Organized
- `REQ-###-short-title.md`: formal requirements.
- `temp/NOTE-###-short-topic.md`: conceptual staging notes.
- `REQ-000-template.md`: formal requirement template.
- `temp/NOTE-000-template.md`: temporary note template.

## ID Policy
- Formal requirement IDs (`REQ-###`) are stable, monotonic, and never reused.
- Temporary note IDs (`NOTE-###`) are independent from formal IDs.

## Two-Stage Workflow
1. Pick one concept for the session.
2. Capture it in a single `temp/NOTE-###` file using plain language.
3. Keep notes conceptual first; do not lock stack/implementation unless explicitly requested.
4. Promote to one formal `REQ-###` draft only after the promotion checklist passes.
5. Keep unresolved items in `Open Questions`; do not force assumptions.
6. Iterate in the same `REQ-###` file until coherent, then move `Draft` -> `Proposed`.

## Writing Standard (All `REQ-###` Files)
- Summary is 1-3 sentences and non-technical language comes first.
- Scope is explicit with both `In scope` and `Out of scope`.
- Requirement statements are testable and observable.
- Acceptance criteria are measurable and unambiguous.
- Open questions are explicit and owned.
- Any change in intent must be recorded in `Changelog`.
- Keep each requirement atomic (one file, one primary capability).

## Promotion Checklist (`NOTE-###` -> `REQ-###`)
- Clear actor: who needs this capability.
- Clear outcome: what must be possible.
- Clear boundary: what is not included.
- Clear success condition: how it will be verified.
- No hidden implementation commitments.
- Any unresolved decision is listed in `Open Questions`.

## Status Labels (Optional)
- Draft
- Proposed
- Accepted
- Implemented
- Deprecated

## Index
### Temp Notes
- `temp/README.md`
- `temp/NOTE-000-template.md`
- `temp/NOTE-001-core-capability-consolidated-view.md`
- `temp/NOTE-002-freshness-and-completeness.md`
- `temp/NOTE-003-access-and-permissions.md`

### Formal Requirements
- `REQ-000-template.md` (template)
