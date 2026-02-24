import { describe, expect, it } from "vitest";
import {
  ensureNoDeprecatedQuarantinePath,
  validateQuarantineEntry
} from "./check-testing-policy.mjs";

describe("validateQuarantineEntry", () => {
  it("rejects malformed quarantine entries with field-level errors", () => {
    const missingOwner = validateQuarantineEntry(
      { id: "apps/api/src/app.test.ts:10", reason: "flake", expiresOn: "2026-02-28" },
      0,
      "tests/policy/test-quarantine.json"
    );
    expect(missingOwner).toEqual({
      valid: false,
      error: "tests/policy/test-quarantine.json:entries[0].owner is required"
    });

    const invalidExpiry = validateQuarantineEntry(
      { id: "apps/api/src/app.test.ts:10", owner: "team-api", reason: "flake", expiresOn: "bad" },
      1,
      "tests/policy/test-quarantine.json"
    );
    expect(invalidExpiry).toEqual({
      valid: false,
      error: "tests/policy/test-quarantine.json:entries[1].expiresOn must be YYYY-MM-DD"
    });
  });
});

describe("ensureNoDeprecatedQuarantinePath", () => {
  it("returns a migration violation when legacy quarantine file exists", async () => {
    const violation = await ensureNoDeprecatedQuarantinePath({
      quarantinePath: "tests/policy/test-quarantine.json",
      docsLink: "tests/README.md#flake-policy",
      fileExistsFn: async () => true
    });

    expect(violation?.ruleId).toBe("TC011");
    expect(violation?.title).toBe("Deprecated quarantine path is not allowed");
    expect(violation?.file).toBe("tests/quarantine.json");
    expect(violation?.fix).toEqual([
      "Move entries from tests/quarantine.json to tests/policy/test-quarantine.json.",
      "Delete tests/quarantine.json after migration."
    ]);
  });

  it("returns null when legacy quarantine path is absent", async () => {
    const violation = await ensureNoDeprecatedQuarantinePath({
      quarantinePath: "tests/policy/test-quarantine.json",
      docsLink: "tests/README.md#flake-policy",
      fileExistsFn: async () => false
    });

    expect(violation).toBeNull();
  });
});
