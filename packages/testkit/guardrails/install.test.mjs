import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  enforceNetworkTarget,
  installTestGuardrails,
  resetTestGuardrailsForTests
} from "./install.mjs";
import { loadRuntimeModePolicy } from "./policy.mjs";

const require = createRequire(import.meta.url);
const childProcess = require("node:child_process");

describe("installTestGuardrails", () => {
  beforeEach(() => {
    resetTestGuardrailsForTests();
  });

  afterEach(() => {
    resetTestGuardrailsForTests();
  });

  it("commit-stage blocks non-loopback network targets (NET001)", () => {
    const commitStage = loadRuntimeModePolicy("commitStage");
    expect(() =>
      enforceNetworkTarget({ source: "test", host: "api.stripe.com", port: 443 }, commitStage)
    ).toThrow(/NET001/);
  });

  it("commit-stage blocks localhost Postgres port (DB001)", () => {
    const commitStage = loadRuntimeModePolicy("commitStage");
    expect(() =>
      enforceNetworkTarget({ source: "test", host: "127.0.0.1", port: 5432 }, commitStage)
    ).toThrow(/DB001/);
  });

  it("commit-stage blocks child_process execution (PROC001)", () => {
    const commitStage = loadRuntimeModePolicy("commitStage");
    installTestGuardrails(commitStage);
    expect(() => childProcess.exec("echo hi")).toThrow(/PROC001/);
  });

  it("integration allows localhost Postgres but still blocks external network", () => {
    const integration = loadRuntimeModePolicy("integration");
    expect(() =>
      enforceNetworkTarget({ source: "test", host: "127.0.0.1", port: 5432 }, integration)
    ).not.toThrow();
    expect(() =>
      enforceNetworkTarget({ source: "test", host: "api.stripe.com", port: 443 }, integration)
    ).toThrow(/NET001/);
  });
});
