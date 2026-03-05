import { afterEach, describe, expect, it, vi } from "vitest";
import { assertHttpOkEventually, normalizeBaseUrl } from "../scripts/verify-candidate-github.mjs";

const originalFetch = globalThis.fetch;

function connectionRefusedError() {
  const error = new Error("fetch failed");
  error.cause = {
    code: "ECONNREFUSED",
    message: "connect ECONNREFUSED 127.0.0.1:3001"
  };
  return error;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("verify-candidate-github http readiness", () => {
  it("retries transient fetch errors and succeeds when endpoint becomes ready", async () => {
    let attempts = 0;
    globalThis.fetch = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw connectionRefusedError();
      }

      return {
        ok: true,
        status: 200
      };
    });

    await expect(
      assertHttpOkEventually("http://127.0.0.1:3001/health", "API health", {
        timeoutMs: 200,
        intervalMs: 1
      })
    ).resolves.toBeUndefined();

    expect(attempts).toBe(3);
  });

  it("fails with detailed context when endpoint never becomes ready", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw connectionRefusedError();
    });

    await expect(
      assertHttpOkEventually("http://127.0.0.1:3001/health", "API health", {
        timeoutMs: 30,
        intervalMs: 1
      })
    ).rejects.toThrow(/did not become ready/);

    await expect(
      assertHttpOkEventually("http://127.0.0.1:3001/health", "API health", {
        timeoutMs: 30,
        intervalMs: 1
      })
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it("normalizes trailing slash in base urls", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:3001/")).toBe("http://127.0.0.1:3001");
    expect(normalizeBaseUrl("http://127.0.0.1:3001")).toBe("http://127.0.0.1:3001");
    expect(() => normalizeBaseUrl()).toThrow(/Base URL must be a string/);
  });
});
