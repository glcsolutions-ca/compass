import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { emitFail, emitPass } from "../shared/ccs-contract.mjs";

const REPO_ROOT = path.resolve(process.cwd());
const REGISTRY_PATH = path.join(REPO_ROOT, ".github", "policy", "ccs-guardrails.json");

async function loadRegistry() {
  const raw = await readFile(REGISTRY_PATH, "utf8");
  return JSON.parse(raw);
}

function createLogger() {
  const info = [];
  const error = [];
  return {
    logger: {
      info: (line) => info.push(String(line)),
      error: (line) => error.push(String(line))
    },
    info,
    error
  };
}

describe("ccs guardrail registry", () => {
  it("has valid registry shape and unique ids", async () => {
    const registry = await loadRegistry();
    expect(registry.schemaVersion).toBe("1");
    expect(Array.isArray(registry.guardrails)).toBe(true);
    expect(registry.guardrails.length).toBeGreaterThan(0);

    const ids = registry.guardrails.map((entry) => entry.guardrailId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists guardrails with non-empty pass/fail codes and refs", async () => {
    const registry = await loadRegistry();
    for (const entry of registry.guardrails) {
      expect(typeof entry.guardrailId).toBe("string");
      expect(entry.guardrailId.trim().length).toBeGreaterThan(0);
      expect(typeof entry.owner).toBe("string");
      expect(entry.owner.trim().length).toBeGreaterThan(0);
      expect(typeof entry.entrypoint).toBe("string");
      expect(entry.entrypoint.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(entry.passCodes)).toBe(true);
      expect(entry.passCodes.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.failCodes)).toBe(true);
      expect(entry.failCodes.length).toBeGreaterThan(0);
      expect(typeof entry.ref).toBe("string");
      expect(entry.ref.trim().length).toBeGreaterThan(0);
    }
  });

  it("references existing files and wrapped entrypoints", async () => {
    const registry = await loadRegistry();
    for (const entry of registry.guardrails) {
      const entrypoint = path.join(REPO_ROOT, entry.entrypoint);
      await expect(stat(entrypoint)).resolves.toBeTruthy();
      const source = await readFile(entrypoint, "utf8");
      expect(source).toContain("withCcsGuardrail");
      expect(source).toContain(`guardrailId: \"${entry.guardrailId}\"`);

      const [refPath] = String(entry.ref).split("#");
      const refAbsolute = path.join(REPO_ROOT, refPath);
      await expect(stat(refAbsolute)).resolves.toBeTruthy();
    }
  });
});

describe("ccs envelope shape", () => {
  it("renders valid pass and fail envelopes for every registry code", async () => {
    const registry = await loadRegistry();

    for (const entry of registry.guardrails) {
      for (const code of entry.passCodes) {
        const { logger, info } = createLogger();
        emitPass({ guardrailId: entry.guardrailId, code, logger });
        expect(info[0]).toBe(`CCS:PASS ${entry.guardrailId} CODE:${code}`);
      }

      for (const code of entry.failCodes) {
        const { logger, error } = createLogger();
        emitFail({
          guardrailId: entry.guardrailId,
          code,
          why: "Contract violation.",
          fix: "Restore guardrail conditions.",
          doCommands: ["pnpm test:quick"],
          ref: entry.ref,
          logger
        });

        expect(error[0]).toBe(`CCS:FAIL ${entry.guardrailId} CODE:${code}`);
        expect(error).toContain("WHY: Contract violation.");
        expect(error).toContain("FIX: Restore guardrail conditions.");
        expect(error).toContain("DO:");
        expect(error).toContain("pnpm test:quick");
        expect(error).toContain(`REF: ${entry.ref}`);
      }
    }
  });
});
