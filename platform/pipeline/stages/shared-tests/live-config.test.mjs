import { describe, expect, it, vi } from "vitest";
import {
  buildEntraRedirectUri,
  deriveProductionWebCustomDomain,
  loadDeliveryConfig,
  loadInfrastructureConfig
} from "../../../config/live-config.mjs";

describe("live-config", () => {
  it("loads delivery config from env and derives naming", async () => {
    const config = await loadDeliveryConfig({
      env: {
        AZURE_DEPLOY_CLIENT_ID: "deploy-client-id",
        AZURE_TENANT_ID: "tenant-id",
        AZURE_SUBSCRIPTION_ID: "subscription-id",
        AZURE_LOCATION: "canadacentral",
        DEPLOYMENT_STAMP: "prd-cc-001",
        PRODUCTION_WEB_BASE_URL: "https://app.example.test",
        AUTH_MODE: "entra",
        ENTRA_WEB_CLIENT_ID: "web-client-id",
        ENTRA_ALLOWED_TENANT_IDS: "tenant-a,tenant-b"
      },
      getRepositoryVariable: vi.fn()
    });

    expect(config.azureResourceGroup).toBe("rg-compass-prd-cc-001");
    expect(config.acaApiProdAppName).toBe("ca-compass-api-prd-cc-001");
    expect(config.azureKeyVaultName).toBe("kv-compass-prd-cc-001");
    expect(config.productionWebCustomDomain).toBe("app.example.test");
    expect(config.entraRedirectUri).toBe("https://app.example.test/v1/auth/entra/callback");
    expect(config.dynamicSessionsPoolManagementEndpoint).toBe(
      "https://canadacentral.dynamicsessions.io/subscriptions/subscription-id/resourceGroups/rg-compass-prd-cc-001/sessionPools/sp-compass-agent-prd-cc-001"
    );
  });

  it("loads infrastructure config and keeps network CIDRs explicit", async () => {
    const config = await loadInfrastructureConfig({
      env: {
        AZURE_DEPLOY_CLIENT_ID: "deploy-client-id",
        AZURE_TENANT_ID: "tenant-id",
        AZURE_SUBSCRIPTION_ID: "subscription-id",
        AZURE_LOCATION: "canadacentral",
        DEPLOYMENT_STAMP: "prd-cc-001",
        PRODUCTION_WEB_BASE_URL: "https://app.example.test",
        AUTH_MODE: "entra",
        ENTRA_WEB_CLIENT_ID: "web-client-id",
        ENTRA_ALLOWED_TENANT_IDS: "tenant-a,tenant-b",
        AZURE_VNET_ADDRESS_PREFIX: "10.62.0.0/16",
        AZURE_ACA_SUBNET_PREFIX: "10.62.0.0/23",
        AZURE_POSTGRES_SUBNET_PREFIX: "10.62.2.0/24"
      },
      getRepositoryVariable: vi.fn()
    });

    expect(config.azureVnetAddressPrefix).toBe("10.62.0.0/16");
    expect(config.azureAcaSubnetName).toBe("snet-compass-aca-prd-cc-001");
    expect(config.azurePostgresStorageMb).toBe(32768);
    expect(config.seedDefaultUserDisplayName).toBe("Production Admin");
  });

  it("falls back to repository variables for missing delivery values", async () => {
    const getRepositoryVariable = vi.fn(async (name) => {
      const values = {
        AZURE_DEPLOY_CLIENT_ID: "deploy-client-id",
        AZURE_TENANT_ID: "tenant-id",
        AZURE_SUBSCRIPTION_ID: "subscription-id",
        AZURE_LOCATION: "canadacentral",
        DEPLOYMENT_STAMP: "prd-cc-001",
        PRODUCTION_WEB_BASE_URL: "https://app.example.test",
        AUTH_MODE: "entra",
        ENTRA_WEB_CLIENT_ID: "web-client-id",
        ENTRA_ALLOWED_TENANT_IDS: "tenant-a,tenant-b"
      };
      return values[name] || "";
    });

    const config = await loadDeliveryConfig({
      env: {},
      getRepositoryVariable
    });

    expect(getRepositoryVariable).toHaveBeenCalledTimes(9);
    expect(config.azureResourceGroup).toBe("rg-compass-prd-cc-001");
    expect(config.productionWebBaseUrl).toBe("https://app.example.test");
  });

  it("fails with the missing canonical variable names", async () => {
    await expect(
      loadDeliveryConfig({
        env: {},
        getRepositoryVariable: vi.fn(async () => "")
      })
    ).rejects.toThrow(
      "Missing required repository variables:\n- AUTH_MODE\n- AZURE_DEPLOY_CLIENT_ID\n- AZURE_LOCATION\n- AZURE_SUBSCRIPTION_ID\n- AZURE_TENANT_ID\n- DEPLOYMENT_STAMP\n- ENTRA_ALLOWED_TENANT_IDS\n- ENTRA_WEB_CLIENT_ID\n- PRODUCTION_WEB_BASE_URL"
    );
  });

  it("derives public web metadata deterministically", () => {
    expect(deriveProductionWebCustomDomain("https://app.example.test")).toBe("app.example.test");
    expect(buildEntraRedirectUri("https://app.example.test/")).toBe(
      "https://app.example.test/v1/auth/entra/callback"
    );
  });

  it("derives stable defaults instead of loading them from repo variables", async () => {
    const config = await loadDeliveryConfig({
      env: {
        AZURE_DEPLOY_CLIENT_ID: "deploy-client-id",
        AZURE_TENANT_ID: "tenant-id",
        AZURE_SUBSCRIPTION_ID: "subscription-id",
        AZURE_LOCATION: "canadacentral",
        DEPLOYMENT_STAMP: "prd-cc-001",
        PRODUCTION_WEB_BASE_URL: "https://app.example.test",
        AUTH_MODE: "entra",
        ENTRA_WEB_CLIENT_ID: "web-client-id",
        ENTRA_ALLOWED_TENANT_IDS: "tenant-a,tenant-b"
      },
      getRepositoryVariable: vi.fn(async () => undefined)
    });

    expect(config.apiLogLevel).toBe("warn");
    expect(config.dbMigrationLockTimeout).toBe("5s");
    expect(config.seedDefaultAppClientId).toBe("");
    expect(config.seedDefaultUserEmail).toBe("admin@compass.local");
  });
});
