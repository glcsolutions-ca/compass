import { describe, expect, it } from "vitest";
import {
  createConnectTokenSecret,
  issueSessionConnectToken,
  verifySessionConnectToken
} from "../../src/agent-sessions/connect-token.js";

describe("session connect token helpers", () => {
  it("issues and verifies a signed token", () => {
    const now = new Date("2026-03-06T20:00:00.000Z");
    const token = issueSessionConnectToken({
      secret: "test-secret",
      sessionIdentifier: "thr-123",
      bootId: "boot-123",
      ttlMs: 30_000,
      now
    });

    expect(
      verifySessionConnectToken({
        token,
        secret: "test-secret",
        now: new Date("2026-03-06T20:00:20.000Z")
      })
    ).toEqual({
      sessionIdentifier: "thr-123",
      bootId: "boot-123",
      iat: now.getTime(),
      exp: now.getTime() + 30_000
    });
  });

  it("rejects expired and tampered tokens", () => {
    const now = new Date("2026-03-06T20:00:00.000Z");
    const token = issueSessionConnectToken({
      secret: "test-secret",
      sessionIdentifier: "thr-123",
      bootId: "boot-123",
      ttlMs: 1_000,
      now
    });
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.AAAA${signature}`;

    expect(
      verifySessionConnectToken({
        token,
        secret: "test-secret",
        now: new Date("2026-03-06T20:00:02.000Z")
      })
    ).toBeNull();
    expect(
      verifySessionConnectToken({
        token: tampered,
        secret: "test-secret",
        now
      })
    ).toBeNull();
  });

  it("generates a random secret when one is not provided", () => {
    const first = createConnectTokenSecret();
    const second = createConnectTokenSecret();

    expect(first).toMatch(/^[0-9a-f]+$/u);
    expect(second).toMatch(/^[0-9a-f]+$/u);
    expect(first).not.toBe(second);
  });
});
