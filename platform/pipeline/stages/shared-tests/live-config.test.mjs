import { describe, expect, it, vi } from "vitest";
import {
  buildEntraRedirectUri,
  deriveProductionWebCustomDomain,
  loadLivePlatformConfig
} from "../../../config/live-config.mjs";

describe("live-config", () => {
  it("loads requested values from env and derives web metadata", async () => {
    const config = await loadLivePlatformConfig({
      env: {
        AZURE_RESOURCE_GROUP: "rg-example-prd-cc-001",
        AZURE_POSTGRES_STORAGE_MB: "32768",
        PRODUCTION_WEB_BASE_URL: "https://app.example.test"
      },
      requiredVariableNames: [
        "AZURE_RESOURCE_GROUP",
        "AZURE_POSTGRES_STORAGE_MB",
        "PRODUCTION_WEB_BASE_URL"
      ],
      getRepositoryVariable: vi.fn()
    });

    expect(config.azureResourceGroup).toBe("rg-example-prd-cc-001");
    expect(config.azurePostgresStorageMb).toBe(32768);
    expect(config.productionWebCustomDomain).toBe("app.example.test");
    expect(config.entraRedirectUri).toBe("https://app.example.test/v1/auth/entra/callback");
  });

  it("falls back to repository variables for missing values", async () => {
    const getRepositoryVariable = vi.fn(async (name) => {
      if (name === "AZURE_RESOURCE_GROUP") {
        return "rg-example-prd-cc-001";
      }
      if (name === "PRODUCTION_WEB_BASE_URL") {
        return "https://app.example.test";
      }
      return "";
    });

    const config = await loadLivePlatformConfig({
      env: {},
      requiredVariableNames: ["AZURE_RESOURCE_GROUP", "PRODUCTION_WEB_BASE_URL"],
      getRepositoryVariable
    });

    expect(getRepositoryVariable).toHaveBeenCalledTimes(2);
    expect(config.azureResourceGroup).toBe("rg-example-prd-cc-001");
    expect(config.productionWebBaseUrl).toBe("https://app.example.test");
  });

  it("fails with the missing canonical variable names", async () => {
    await expect(
      loadLivePlatformConfig({
        env: {},
        requiredVariableNames: ["AZURE_RESOURCE_GROUP", "PRODUCTION_WEB_BASE_URL"],
        getRepositoryVariable: vi.fn(async () => "")
      })
    ).rejects.toThrow(
      "Missing required repository variables:\n- AZURE_RESOURCE_GROUP\n- PRODUCTION_WEB_BASE_URL"
    );
  });

  it("derives public web metadata deterministically", () => {
    expect(deriveProductionWebCustomDomain("https://app.example.test")).toBe("app.example.test");
    expect(buildEntraRedirectUri("https://app.example.test/")).toBe(
      "https://app.example.test/v1/auth/entra/callback"
    );
  });

  it("treats allow-empty canonical values as optional repository variables", async () => {
    const config = await loadLivePlatformConfig({
      env: {
        AZURE_RESOURCE_GROUP: "rg-example-prd-cc-001"
      },
      requiredVariableNames: ["AZURE_RESOURCE_GROUP"],
      optionalVariableNames: ["SEED_DEFAULT_APP_CLIENT_ID"],
      getRepositoryVariable: vi.fn(async () => undefined)
    });

    expect(config.azureResourceGroup).toBe("rg-example-prd-cc-001");
    expect(config.seedDefaultAppClientId).toBeUndefined();
  });
});
