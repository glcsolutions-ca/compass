import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../../../");

const readRepoFile = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("Entra auth infra wiring", () => {
  it("injects auth mode and Key Vault secret refs into the API container app", () => {
    const apiModule = readRepoFile("infra/azure/modules/containerapp-api.bicep");

    expect(apiModule).toContain("param keyVaultUri string");
    expect(apiModule).toContain("param authMode string = 'entra'");
    expect(apiModule).toContain("name: 'AUTH_MODE'");
    expect(apiModule).toContain("name: 'ENTRA_CLIENT_ID'");
    expect(apiModule).toContain("name: 'ENTRA_ALLOWED_TENANT_IDS'");

    expect(apiModule).toContain("name: 'entra-client-secret'");
    expect(apiModule).toContain("name: 'auth-oidc-state-encryption-key'");
    expect(apiModule).toContain("name: 'oauth-token-signing-secret'");
    expect(apiModule).toContain("keyVaultUrl:");
    expect(apiModule).not.toContain("name: 'ENTRA_LOGIN_ENABLED'");
  });

  it("passes Key Vault and auth mode params from main template into API module", () => {
    const mainTemplate = readRepoFile("infra/azure/main.bicep");

    expect(mainTemplate).toContain("module api './modules/containerapp-api.bicep'");
    expect(mainTemplate).toContain("keyVaultUri: keyVaultUri");
    expect(mainTemplate).toContain("authMode: authMode");
    expect(mainTemplate).toContain("entraClientId: entraClientId");
    expect(mainTemplate).toContain("entraAllowedTenantIds: entraAllowedTenantIds");
  });

  it("wires web session secret via Key Vault and removes auth fallback flags", () => {
    const webModule = readRepoFile("infra/azure/modules/containerapp-web.bicep");

    expect(webModule).toContain("param keyVaultUri string");
    expect(webModule).toContain("name: 'web-session-secret'");
    expect(webModule).toContain("keyVaultUrl:");
    expect(webModule).not.toContain("name: 'ENTRA_LOGIN_ENABLED'");
    expect(webModule).not.toContain("name: 'AUTH_DEV_FALLBACK_ENABLED'");
  });
});
