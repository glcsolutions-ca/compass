import { describe, expect, it } from "vitest";
import { buildCodexGatewayApp } from "./app.js";
import { InMemoryRepository } from "./storage/repository.js";

describe("codex gateway app", () => {
  it("serves health endpoint", async () => {
    const app = buildCodexGatewayApp({
      config: {
        nodeEnv: "test",
        host: "127.0.0.1",
        port: 3010,
        logLevel: "silent",
        databaseUrl: undefined,
        codexBinPath: "codex",
        codexHome: "/tmp/codex-home",
        serviceApiKey: undefined,
        clientName: "compass_codex_gateway",
        clientVersion: "0.1.0",
        startOnBoot: false,
        entraClientId: undefined,
        entraClientSecret: undefined,
        entraRedirectUri: undefined,
        entraAllowedTenantIds: [],
        entraLoginEnabled: false,
        authDevFallbackEnabled: false
      },
      repository: new InMemoryRepository()
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
