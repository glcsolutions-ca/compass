import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(currentDir, "verify-api-smoke.mjs");
const scriptSource = readFileSync(scriptPath, "utf8").replace(/\r\n/g, "\n");

describe("verify-api-smoke auth redirect contract", () => {
  it("requires auth-start redirect shape and supports callback-uri contract checks", () => {
    expect(scriptSource).toMatch(/\/v1\/auth\/entra\/start\?returnTo=%2F/u);
    expect(scriptSource).toContain("auth-start-location-present");
    expect(scriptSource).toContain("auth-start-redirect-shape");
    expect(scriptSource).toContain("EXPECTED_ENTRA_REDIRECT_URI");
    expect(scriptSource).toContain("auth-start-redirect-uri");
    expect(scriptSource).not.toContain("EXPECTED_ENTRA_CLIENT_ID");
    expect(scriptSource).not.toContain("ENTRA_LOGIN_DISABLED");
    expect(scriptSource).not.toContain("ENTRA_CONFIG_REQUIRED");
    expect(scriptSource).not.toContain("AUTH_NOT_CONFIGURED");
  });
});
