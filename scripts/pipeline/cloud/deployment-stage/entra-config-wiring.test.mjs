import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../../../");

const readRepoFile = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("Entra auth infra wiring", () => {
  it("injects Entra auth config into the API container app", () => {
    const apiModule = readRepoFile("infra/azure/modules/containerapp-api.bicep");

    expect(apiModule).toContain("param webBaseUrl string");
    expect(apiModule).toContain("param entraLoginEnabled string = 'false'");
    expect(apiModule).toContain("param entraClientId string = ''");
    expect(apiModule).toContain("param entraAllowedTenantIds string = ''");
    expect(apiModule).toContain("param entraClientSecret string = ''");

    expect(apiModule).toContain("name: 'WEB_BASE_URL'");
    expect(apiModule).toContain("name: 'ENTRA_LOGIN_ENABLED'");
    expect(apiModule).toContain("name: 'ENTRA_CLIENT_ID'");
    expect(apiModule).toContain("name: 'ENTRA_ALLOWED_TENANT_IDS'");
    expect(apiModule).toContain("name: 'ENTRA_CLIENT_SECRET'");
  });

  it("passes Entra auth params from main template into API module", () => {
    const mainTemplate = readRepoFile("infra/azure/main.bicep");

    expect(mainTemplate).toContain("module api './modules/containerapp-api.bicep'");
    expect(mainTemplate).toContain("webBaseUrl: webBaseUrl");
    expect(mainTemplate).toContain("entraLoginEnabled: entraLoginEnabled");
    expect(mainTemplate).toContain("entraClientId: entraClientId");
    expect(mainTemplate).toContain("entraClientSecret: entraClientSecret");
    expect(mainTemplate).toContain("entraAllowedTenantIds: entraAllowedTenantIds");
  });
});
