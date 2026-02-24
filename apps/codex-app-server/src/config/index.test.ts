import { describe, expect, it } from "vitest";
import { loadCodexAppConfig } from "./index.js";

describe("loadCodexAppConfig", () => {
  it("applies defaults", () => {
    const config = loadCodexAppConfig({});

    expect(config.port).toBe(3010);
    expect(config.host).toBe("0.0.0.0");
    expect(config.codexBinPath).toBe("codex");
    expect(config.clientName).toBe("compass_codex_gateway");
    expect(config.startOnBoot).toBe(true);
  });

  it("parses env overrides", () => {
    const config = loadCodexAppConfig({
      CODEX_PORT: "3456",
      CODEX_HOST: "127.0.0.1",
      CODEX_BIN_PATH: "/tmp/codex",
      CODEX_HOME: "/tmp/codex-home",
      CODEX_START_ON_BOOT: "false",
      OPENAI_API_KEY: "sk-test"
    });

    expect(config.port).toBe(3456);
    expect(config.host).toBe("127.0.0.1");
    expect(config.codexBinPath).toBe("/tmp/codex");
    expect(config.codexHome).toBe("/tmp/codex-home");
    expect(config.startOnBoot).toBe(false);
    expect(config.serviceApiKey).toBe("sk-test");
  });
});
