import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../shared/scripts/cli-utils.mjs";

describe("parseCliArgs", () => {
  it("parses regular long options and positional args", () => {
    const parsed = parseCliArgs(["--candidate-id", "sha-abc", "positional", "--flag"]);

    expect(parsed).toEqual({
      _: ["positional"],
      "candidate-id": "sha-abc",
      flag: true
    });
  });

  it("ignores standalone separators emitted by pnpm argument forwarding", () => {
    const parsed = parseCliArgs(["--", "--candidate-id", "sha-def", "--out", "/tmp/out.json"]);

    expect(parsed).toEqual({
      _: [],
      "candidate-id": "sha-def",
      out: "/tmp/out.json"
    });
  });
});
