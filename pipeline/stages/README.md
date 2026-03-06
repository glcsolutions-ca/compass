# Pipeline Stages

The active stage model is:

1. `Commit Stage`
2. `Acceptance Stage`
3. `Release Stage`

Those three stages run inside the cloud delivery workflow:

- [01-cloud-development-pipeline.yml](/Users/justinkropp/.codex/worktrees/2bfd/compass/.github/workflows/01-cloud-development-pipeline.yml)

That workflow runs on GitHub merge queue (`merge_group`) for normal forward delivery and on `workflow_dispatch` for rare recovery redeploy of a previously released candidate by `candidate_id`.

PR-time concerns live separately in:

- [00-pr-metadata-and-admission.yml](/Users/justinkropp/.codex/worktrees/2bfd/compass/.github/workflows/00-pr-metadata-and-admission.yml)

That PR workflow applies informational labels and runs Queue Admission so a pull request can enter merge queue. It is a GitHub prerequisite, not part of the deployment pipeline stage model.
