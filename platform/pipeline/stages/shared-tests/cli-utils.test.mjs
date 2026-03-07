import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../shared/scripts/cli-utils.mjs";

describe("parseCliArgs", () => {
  it("ignores pnpm forwarded double-dash markers", () => {
    const options = parseCliArgs([
      "--",
      "--candidate-id",
      "sha-abc123",
      "--registry-repo",
      "ghcr.io/example/repo",
      "--out",
      "/tmp/candidate.json"
    ]);

    expect(options).toEqual({
      _: [],
      "candidate-id": "sha-abc123",
      "registry-repo": "ghcr.io/example/repo",
      out: "/tmp/candidate.json"
    });
  });
});
