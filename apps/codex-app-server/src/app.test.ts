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

    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve server address");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
