import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { ConsolidatedEmployeeViewSchema } from "@compass/contracts";
import { buildApiApp } from "./app.js";
import { InMemoryConsolidatedViewRepository } from "./features/consolidated-view/repository.js";

const authConfig = {
  nodeEnv: "test" as const,
  authMode: "development" as const,
  devJwtSecret: "dev-secret-change-me",
  requiredScope: "time.read",
  databaseUrl: undefined,
  dbPoolMax: 10,
  dbIdleTimeoutMs: 10_000,
  dbConnectionTimeoutMs: 2_000,
  dbSslMode: "disable" as const,
  dbSslRejectUnauthorized: true,
  host: "127.0.0.1",
  port: 3001
};

async function makeToken(payload: { sub: string; scp?: string; roles?: string[] }) {
  return await new SignJWT({
    scp: payload.scp,
    roles: payload.roles
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(authConfig.devJwtSecret));
}

describe("API", () => {
  it("returns health status", async () => {
    const app = buildApiApp({ config: authConfig });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");

    await app.close();
  });

  it("registers postgres plugin when databaseUrl is provided", async () => {
    const app = buildApiApp({
      config: {
        ...authConfig,
        databaseUrl: "postgres://compass:compass@127.0.0.1:5432/compass"
      },
      repository: new InMemoryConsolidatedViewRepository()
    });

    await app.ready();
    expect(app.hasDecorator("pg")).toBe(true);

    await app.close();
  });

  it("rejects requests without bearer token", async () => {
    const app = buildApiApp({ config: authConfig });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/employees/employee-123/consolidated-view"
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns consolidated employee view for authenticated employee", async () => {
    const app = buildApiApp({ config: authConfig });
    const token = await makeToken({ sub: "employee-123", scp: "time.read" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/employees/employee-123/consolidated-view",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    const parsed = ConsolidatedEmployeeViewSchema.parse(payload);

    expect(parsed.employeeId).toBe("employee-123");
    expect(parsed.freshnessLagSeconds).toBeLessThanOrEqual(60);

    await app.close();
  });

  it("rejects employee access mismatch without admin role", async () => {
    const app = buildApiApp({ config: authConfig });
    const token = await makeToken({ sub: "employee-123", scp: "time.read" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/employees/employee-admin/consolidated-view",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("serves openapi document", async () => {
    const app = buildApiApp({ config: authConfig });

    const response = await app.inject({ method: "GET", url: "/openapi.json" });

    expect(response.statusCode).toBe(200);
    expect(response.json().paths["/api/v1/employees/{employeeId}/consolidated-view"]).toBeDefined();

    await app.close();
  });
});
