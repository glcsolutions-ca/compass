import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { ConsolidatedEmployeeViewSchema } from "@compass/contracts";
import { buildApiApp } from "./app.js";
import { loadApiConfig } from "./config/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for integration tests");
}

const config = loadApiConfig({
  DATABASE_URL: databaseUrl,
  AUTH_MODE: "development",
  DEV_JWT_SECRET: "dev-secret-change-me"
});

async function makeToken(payload: { sub: string; scp?: string; roles?: string[] }) {
  return await new SignJWT({
    scp: payload.scp,
    roles: payload.roles
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.devJwtSecret));
}

describe("Postgres integration", () => {
  const directDb = new Client({ connectionString: databaseUrl });
  const app = buildApiApp({ config });

  beforeAll(async () => {
    await directDb.connect();
    await app.ready();

    await directDb.query(
      `
        INSERT INTO consolidated_employee_views (employee_id, view_data)
        VALUES (
          'employee-freshness',
          jsonb_build_object(
            'employeeId',
            'employee-freshness',
            'asOf',
            to_char((NOW() AT TIME ZONE 'utc') - interval '90 seconds', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'freshnessLagSeconds',
            0,
            'sourceSystems',
            jsonb_build_array(
              jsonb_build_object(
                'name',
                'jira',
                'status',
                'healthy',
                'lastSyncedAt',
                to_char((NOW() AT TIME ZONE 'utc') - interval '80 seconds', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              )
            ),
            'timeEntries',
            jsonb_build_array(),
            'workPackages',
            jsonb_build_array()
          )
        )
        ON CONFLICT (employee_id) DO UPDATE
        SET
          view_data = EXCLUDED.view_data,
          updated_at = NOW()
      `
    );
  });

  afterAll(async () => {
    await Promise.all([app.close(), directDb.end()]);
  });

  it("returns schema-valid data for a seeded employee", async () => {
    const token = await makeToken({ sub: "employee-123", scp: "time.read" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/employees/employee-123/consolidated-view",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(200);
    const parsed = ConsolidatedEmployeeViewSchema.parse(response.json());
    expect(parsed.employeeId).toBe("employee-123");
  });

  it("returns 404 for an unknown employee", async () => {
    const token = await makeToken({ sub: "employee-missing", scp: "time.read" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/employees/employee-missing/consolidated-view",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(404);
  });

  it("recomputes freshness lag from asOf instead of stored freshnessLagSeconds", async () => {
    const token = await makeToken({ sub: "employee-freshness", scp: "time.read" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/employees/employee-freshness/consolidated-view",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = ConsolidatedEmployeeViewSchema.parse(response.json());

    expect(payload.freshnessLagSeconds).toBeGreaterThanOrEqual(80);
    expect(payload.freshnessLagSeconds).not.toBe(0);
  });
});
