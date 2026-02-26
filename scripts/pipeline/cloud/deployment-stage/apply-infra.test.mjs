import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  applyBicepTemplate,
  buildDeploymentCommandArgs,
  createArmDeploymentName
} from "./apply-infra.mjs";

describe("createArmDeploymentName", () => {
  it("builds deterministic run-scoped name from run id and attempt", () => {
    const name = createArmDeploymentName({
      prefix: "main",
      runId: "22321678387",
      runAttempt: "2"
    });

    expect(name).toBe("main-22321678387-2");
  });
});

describe("buildDeploymentCommandArgs", () => {
  it("includes explicit --name for validate and create invocations", () => {
    const baseOptions = {
      resourceGroup: "rg-compass-prod",
      deploymentName: "main-22321678387-1",
      templateFile: "infra/azure/main.bicep",
      parametersFile: ".artifacts/infra/abc123/runtime.parameters.json"
    };

    const validateArgs = buildDeploymentCommandArgs({
      ...baseOptions,
      command: "validate"
    });

    const createArgs = buildDeploymentCommandArgs({
      ...baseOptions,
      command: "create"
    });

    expect(validateArgs).toEqual([
      "deployment",
      "group",
      "validate",
      "--resource-group",
      "rg-compass-prod",
      "--name",
      "main-22321678387-1",
      "--template-file",
      "infra/azure/main.bicep",
      "--parameters",
      "@.artifacts/infra/abc123/runtime.parameters.json"
    ]);

    expect(createArgs).toEqual([
      "deployment",
      "group",
      "create",
      "--resource-group",
      "rg-compass-prod",
      "--name",
      "main-22321678387-1",
      "--template-file",
      "infra/azure/main.bicep",
      "--parameters",
      "@.artifacts/infra/abc123/runtime.parameters.json",
      "--output",
      "json"
    ]);
  });

  it("appends optional parameter overrides after parameter file", () => {
    const args = buildDeploymentCommandArgs({
      command: "create",
      resourceGroup: "rg-compass-prod",
      deploymentName: "main-22321678387-1",
      templateFile: "infra/azure/main.bicep",
      parametersFile: "infra/azure/environments/cloud.bicepparam",
      parameterOverrides: ["apiImage=acr.io/api@sha256:abc", "authMode=entra"]
    });

    expect(args).toEqual([
      "deployment",
      "group",
      "create",
      "--resource-group",
      "rg-compass-prod",
      "--name",
      "main-22321678387-1",
      "--template-file",
      "infra/azure/main.bicep",
      "--parameters",
      "@infra/azure/environments/cloud.bicepparam",
      "--parameters",
      "apiImage=acr.io/api@sha256:abc",
      "authMode=entra",
      "--output",
      "json"
    ]);
  });
});

describe("applyBicepTemplate", () => {
  it("retries once on transient failure and succeeds", async () => {
    const artifactDir = await mkdtemp(path.join(os.tmpdir(), "apply-bicep-"));
    const runAz = vi
      .fn()
      .mockResolvedValueOnce({ success: true, stdout: "", stderr: "", code: 0 })
      .mockResolvedValueOnce({
        success: false,
        stdout: "",
        stderr: "OperationInProgress: another operation is in progress",
        code: 1
      })
      .mockResolvedValueOnce({
        success: true,
        stdout: '{"name":"main-22321678387-1"}',
        stderr: "",
        code: 0
      });
    const sleepFn = vi.fn(async () => {});

    const result = await applyBicepTemplate({
      resourceGroup: "rg-compass-prod",
      templateFile: "infra/azure/main.bicep",
      parametersFile: ".artifacts/infra/abc123/runtime.parameters.json",
      artifactDir,
      deploymentName: "main-22321678387-1",
      maxAttempts: 2,
      retryDelayMs: 5,
      runAz,
      sleepFn,
      nowFn: () => new Date("2026-02-23T20:00:00Z")
    });

    expect(result.deploymentName).toBe("main-22321678387-1");
    expect(result.attemptsUsed).toBe(2);
    expect(runAz).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(1);

    const attemptsLog = await readFile(path.join(artifactDir, "deployment-attempts.log"), "utf8");
    expect(attemptsLog).toContain("status=retry transient=true");
    expect(attemptsLog).toContain("status=success");
  });

  it("fails fast on non-transient create failure without retry", async () => {
    const artifactDir = await mkdtemp(path.join(os.tmpdir(), "apply-bicep-"));
    const runAz = vi
      .fn()
      .mockResolvedValueOnce({ success: true, stdout: "", stderr: "", code: 0 })
      .mockResolvedValueOnce({
        success: false,
        stdout: "",
        stderr: "InvalidTemplateDeployment: terminal error",
        code: 1
      });

    await expect(
      applyBicepTemplate({
        resourceGroup: "rg-compass-prod",
        templateFile: "infra/azure/main.bicep",
        parametersFile: ".artifacts/infra/abc123/runtime.parameters.json",
        artifactDir,
        deploymentName: "main-22321678387-1",
        maxAttempts: 2,
        retryDelayMs: 5,
        runAz,
        sleepFn: vi.fn(async () => {}),
        nowFn: () => new Date("2026-02-23T20:00:00Z")
      })
    ).rejects.toThrow("Infra apply failed with terminal diagnostics");

    expect(runAz).toHaveBeenCalledTimes(2);
  });
});
