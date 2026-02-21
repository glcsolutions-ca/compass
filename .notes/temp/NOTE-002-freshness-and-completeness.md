# NOTE-002: Freshness and Completeness

## Topic
Define what "trusted data" means for the consolidated employee view.

## User Value
Employees can rely on one view if updates appear quickly and their full data is present across all approved systems.

## Must Be True
- Changes should appear in the consolidated view within 1 minute.
- Completeness means all approved systems and all employee entries/work packages are represented.
- V1 has no user-facing stale/delay indicator.
- Missed freshness/completeness targets trigger internal platform-team alerts.

## Out Of Scope
- Monitoring tool selection and implementation.
- Detailed incident workflow and escalation runbooks.

## Open Questions
- What threshold or duration constitutes a freshness/completeness breach?
- What acknowledgement/response time should platform operations follow?

## Candidate Requirement
The system shall present complete employee time-entry and work-package data from all approved source systems within 1 minute of source updates, with internal alerting when this target is not met.
