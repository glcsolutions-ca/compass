import { describe, expect, it, vi } from "vitest";
import { resolveScopeShas } from "./resolve-scope-lib.mjs";

describe("resolveScopeShas", () => {
  it("uses explicit PR/base/tested SHAs when provided", async () => {
    const getCurrentSha = vi.fn(async () => "current");
    const getParentSha = vi.fn(async () => "parent");

    const result = await resolveScopeShas({
      env: {
        GITHUB_BASE_SHA: "base-pr",
        GITHUB_HEAD_SHA: "head-pr",
        GITHUB_TESTED_SHA: "tested-merge"
      },
      getCurrentSha,
      getParentSha
    });

    expect(result).toEqual({
      baseSha: "base-pr",
      headSha: "head-pr",
      testedSha: "tested-merge"
    });
    expect(getCurrentSha).not.toHaveBeenCalled();
    expect(getParentSha).not.toHaveBeenCalled();
  });

  it("supports push/base-only context with head/tested fallback to github.sha", async () => {
    const getCurrentSha = vi.fn(async () => "push-sha");
    const getParentSha = vi.fn(async () => "unused-parent");

    const result = await resolveScopeShas({
      env: {
        GITHUB_BASE_SHA: "push-base"
      },
      getCurrentSha,
      getParentSha
    });

    expect(result).toEqual({
      baseSha: "push-base",
      headSha: "push-sha",
      testedSha: "push-sha"
    });
    expect(getCurrentSha).toHaveBeenCalledTimes(2);
    expect(getParentSha).not.toHaveBeenCalled();
  });

  it("falls back deterministically when base SHA is missing", async () => {
    const getCurrentSha = vi.fn(async () => "head-fallback");
    const getParentSha = vi.fn(async (sha) => `${sha}-parent`);

    const result = await resolveScopeShas({
      env: {},
      getCurrentSha,
      getParentSha
    });

    expect(result).toEqual({
      baseSha: "head-fallback-parent",
      headSha: "head-fallback",
      testedSha: "head-fallback"
    });
    expect(getCurrentSha).toHaveBeenCalledTimes(2);
    expect(getParentSha).toHaveBeenCalledWith("head-fallback");
  });
});
