import { describe, expect, it } from "vitest";
import { decideRecoveryAction, isRecoveryRevertCommit } from "./auto-recover-main.mjs";

describe("decideRecoveryAction", () => {
  it("requests rerun of failed jobs on first hard deterministic failure", () => {
    const decision = decideRecoveryAction({
      workflowName: "Commit Stage",
      conclusion: "failure",
      runAttempt: 1,
      failedJobNames: ["commit-test-suite", "commit-stage"],
      recoveryRevertCommit: false
    });

    expect(decision).toEqual({
      action: "rerun-failed-jobs",
      reasonCode: "RERUN_FAILED_JOBS_REQUESTED",
      hardDeterministicFailure: true
    });
  });

  it("reverts on second hard deterministic failure", () => {
    const decision = decideRecoveryAction({
      workflowName: "Integration Gate",
      conclusion: "failure",
      runAttempt: 2,
      failedJobNames: ["build-compile", "integration-gate"],
      recoveryRevertCommit: false
    });

    expect(decision).toEqual({
      action: "revert-head-commit",
      reasonCode: "AUTO_REVERT_REQUIRED",
      hardDeterministicFailure: true
    });
  });

  it("does nothing when rerun succeeds (flaky failure path)", () => {
    const decision = decideRecoveryAction({
      workflowName: "Integration Gate",
      conclusion: "success",
      runAttempt: 2,
      failedJobNames: [],
      recoveryRevertCommit: false
    });

    expect(decision).toEqual({
      action: "noop",
      reasonCode: "NOT_HARD_DETERMINISTIC_FAILURE",
      hardDeterministicFailure: false
    });
  });

  it("does nothing for recovery-created revert commits", () => {
    const recoveryCommit = isRecoveryRevertCommit({
      message: 'Revert "bad commit"\n\nMain-Red-Recovery: true\nFailed-Head-Sha: abc123',
      authorLogin: "github-actions[bot]",
      committerLogin: "github-actions[bot]"
    });

    const decision = decideRecoveryAction({
      workflowName: "Commit Stage",
      conclusion: "failure",
      runAttempt: 2,
      failedJobNames: ["commit-stage"],
      recoveryRevertCommit: recoveryCommit
    });

    expect(decision).toEqual({
      action: "noop",
      reasonCode: "HEAD_ALREADY_RECOVERY_REVERT",
      hardDeterministicFailure: false
    });
  });
});
