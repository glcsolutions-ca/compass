import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(currentDir, "verify-api-smoke.mjs");
const scriptSource = readFileSync(scriptPath, "utf8").replace(/\r\n/g, "\n");

describe("verify-api-smoke auth redirect contract", () => {
  it("requires auth-start to be a provider redirect instead of an auth-disabled fallback", () => {
    expect(scriptSource).toMatch(/\/v1\/auth\/entra\/start\?returnTo=%2F/u);
    expect(scriptSource).toContain("EXPECTED_ENTRA_CLIENT_ID");
    expect(scriptSource).toContain("EXPECTED_ENTRA_REDIRECT_URI");
    expect(scriptSource).toContain("/organizations/oauth2/v2.0/authorize");
    expect(scriptSource).toContain('searchParams.get("redirect_uri")');
    expect(scriptSource).toContain('searchParams.get("client_id")');
    expect(scriptSource).not.toContain("ENTRA_LOGIN_DISABLED");
    expect(scriptSource).not.toContain("ENTRA_CONFIG_REQUIRED");
    expect(scriptSource).not.toContain("AUTH_NOT_CONFIGURED");
  });
});
