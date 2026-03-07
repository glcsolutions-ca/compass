import { describe, expect, it } from "vitest";
import {
  buildManagedApiEnv,
  buildManagedWebEnv,
  mergeContainerAppEnv
} from "../scripts/release-azure-lib.mjs";

describe("release-azure-lib", () => {
  it("merges existing env values and secret refs with overrides", () => {
    const result = mergeContainerAppEnv(
      [
        { name: "DATABASE_URL", secretRef: "database-url" },
        { name: "AUTH_MODE", value: "mock" },
        { name: "ENTRA_CLIENT_ID", value: "client-id" }
      ],
      {
        AUTH_MODE: "entra",
        API_PUBLIC_BASE_URL: "https://api.example.com"
      }
    );

    expect(result).toEqual([
      "DATABASE_URL=secretref:database-url",
      "AUTH_MODE=entra",
      "ENTRA_CLIENT_ID=client-id",
      "API_PUBLIC_BASE_URL=https://api.example.com"
    ]);
  });

  it("builds managed api env with entra auth and runtime settings", () => {
    expect(
      buildManagedApiEnv({
        apiPublicBaseUrl: "https://api.example.com",
        webBaseUrl: "https://web.example.com"
      })
    ).toEqual({
      AGENT_GATEWAY_ENABLED: "true",
      AGENT_CLOUD_MODE_ENABLED: "true",
      API_PUBLIC_BASE_URL: "https://api.example.com",
      AUTH_MODE: "entra",
      WEB_BASE_URL: "https://web.example.com"
    });
  });

  it("builds managed web env pointing at the API base url", () => {
    expect(
      buildManagedWebEnv({
        apiBaseUrl: "https://api.example.com"
      })
    ).toEqual({
      API_BASE_URL: "https://api.example.com"
    });
  });
});
