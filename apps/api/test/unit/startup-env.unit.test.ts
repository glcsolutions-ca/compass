import { describe, expect, it, vi } from "vitest";
import { requireDatabaseUrl, verifyDatabaseReadiness } from "../../src/bootstrap/startup-env.js";

describe("startup-env", () => {
  it("requires explicit DATABASE_URL", () => {
    expect(() =>
      requireDatabaseUrl("postgres://compass:compass@localhost:5432/compass")
    ).not.toThrow();
    expect(() => requireDatabaseUrl(undefined)).toThrow("DATABASE_URL is required");
    expect(() => requireDatabaseUrl("   ")).toThrow("DATABASE_URL is required");
  });

  it("preserves caught connectivity error as cause", async () => {
    const connectionError = Object.assign(new Error("connect ECONNREFUSED ::1:5432"), {
      code: "ECONNREFUSED"
    });
    const end = vi.fn(async () => {});
    const clientFactory = vi.fn(() => ({
      connect: vi.fn(async () => {
        throw connectionError;
      }),
      query: vi.fn(async () => ({ rows: [{ ok: true }] })),
      end
    }));

    try {
      await verifyDatabaseReadiness({
        databaseUrl: "postgres://compass:compass@localhost:5432/compass",
        clientFactory
      });
      throw new Error("Expected verifyDatabaseReadiness to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("connect ECONNREFUSED ::1:5432");
      expect((error as Error & { cause?: unknown }).cause).toBe(connectionError);
      expect(end).not.toHaveBeenCalled();
    }
  });

  it("closes the client when readiness succeeds", async () => {
    const connect = vi.fn(async () => {});
    const query = vi.fn(async () => ({ rows: [{ ok: true }] }));
    const end = vi.fn(async () => {});

    await verifyDatabaseReadiness({
      databaseUrl: "postgres://compass:compass@localhost:5432/compass",
      clientFactory: () => ({ connect, query, end })
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("select 1");
    expect(end).toHaveBeenCalledTimes(1);
  });
});
