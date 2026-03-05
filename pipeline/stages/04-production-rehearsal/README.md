# Production Rehearsal Stage

This stage deploys the accepted candidate to the inactive blue/green production label at `0%` traffic, then verifies the inactive URLs before any manual production promotion.

Workflow: `.github/workflows/04-production-rehearsal-stage.yml`.
