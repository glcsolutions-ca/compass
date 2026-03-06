# Pipeline Stages

The active stage model is:

1. `01 Commit`
2. `02 Acceptance`
3. `03 Release`

There are no extra pre-release orchestration stages in the current architecture.

Release uses long-lived stage/prod app pairs instead of revision traffic shifting.
