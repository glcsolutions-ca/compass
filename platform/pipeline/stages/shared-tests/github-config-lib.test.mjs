import { describe, expect, it } from "vitest";
import {
  assertCanonicalGithubConfig,
  findEnvironmentScopedConfigViolations,
  findMissingRepositoryVariables
} from "../../../scripts/bootstrap/github-config-lib.mjs";

describe("github-config-lib", () => {
  it("reports missing canonical repo variables", () => {
    expect(
      findMissingRepositoryVariables([{ name: "AZURE_TENANT_ID" }], [
        "AZURE_TENANT_ID",
        "AZURE_SUBSCRIPTION_ID"
      ])
    ).toEqual(["AZURE_SUBSCRIPTION_ID"]);
  });

  it("reports environment-scoped config violations", () => {
    expect(
      findEnvironmentScopedConfigViolations({
        environmentNames: ["stage"],
        environmentVariablesByName: {
          stage: [{ name: "AZURE_TENANT_ID" }]
        },
        environmentSecretsByName: {
          stage: [{ name: "AZURE_DEPLOY_CLIENT_ID" }]
        }
      })
    ).toEqual([
      "Environment 'stage' still has variables: AZURE_TENANT_ID",
      "Environment 'stage' still has secrets: AZURE_DEPLOY_CLIENT_ID"
    ]);
  });

  it("fails when canonical GitHub config is incomplete", () => {
    expect(() =>
      assertCanonicalGithubConfig({
        repositoryVariables: [{ name: "AZURE_TENANT_ID" }],
        requiredVariableNames: ["AZURE_TENANT_ID", "AZURE_SUBSCRIPTION_ID"],
        environmentNames: ["stage"],
        environmentVariablesByName: { stage: [{ name: "AZURE_RESOURCE_GROUP" }] },
        environmentSecretsByName: { stage: [] }
      })
    ).toThrow(
      "Canonical GitHub configuration violations:\n- Missing repository variable 'AZURE_SUBSCRIPTION_ID'\n- Environment 'stage' still has variables: AZURE_RESOURCE_GROUP"
    );
  });

  it("passes when repo vars are present and environments are protection-only", () => {
    expect(() =>
      assertCanonicalGithubConfig({
        repositoryVariables: [{ name: "AZURE_TENANT_ID" }, { name: "AZURE_SUBSCRIPTION_ID" }],
        requiredVariableNames: ["AZURE_TENANT_ID", "AZURE_SUBSCRIPTION_ID"],
        environmentNames: ["stage", "production"],
        environmentVariablesByName: { stage: [], production: [] },
        environmentSecretsByName: { stage: [], production: [] }
      })
    ).not.toThrow();
  });
});

