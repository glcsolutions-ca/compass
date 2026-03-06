# Pipeline Stages

The active stage model is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

All three stages run inside one workflow:

- [01-development-pipeline.yml](/Users/justinkropp/.codex/worktrees/2bfd/compass/.github/workflows/01-development-pipeline.yml)

That workflow runs on GitHub merge queue (`merge_group`) for normal delivery and on `workflow_dispatch` for manual redeploy by `candidate_id`.
