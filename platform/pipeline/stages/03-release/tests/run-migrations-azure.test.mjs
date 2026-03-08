import { describe, expect, it } from "vitest";
import {
  buildMigrationsFailureMessage,
  buildMigrationsJobPatchDocument,
  buildMigrationsJobUpdateArgs,
  MIGRATIONS_JOB_COMMAND
} from "../../../shared/scripts/azure/run-migrations-azure.mjs";

describe("run-migrations-azure", () => {
  it("builds a patch document that keeps the job env and resources while fixing the command", () => {
    expect(
      buildMigrationsJobPatchDocument({
        migrationsImage: "ghcr.io/example/migrations@sha256:abc",
        job: {
          properties: {
            template: {
              containers: [
                {
                  name: "migrate",
                  image: "ghcr.io/example/migrations@sha256:old",
                  imageType: "ContainerImage",
                  env: [{ name: "DATABASE_URL", secretRef: "database-url" }],
                  resources: { cpu: 0.25, memory: "0.5Gi" }
                }
              ]
            }
          }
        }
      })
    ).toEqual({
      properties: {
        template: {
          containers: [
            {
              name: "migrate",
              image: "ghcr.io/example/migrations@sha256:abc",
              env: [{ name: "DATABASE_URL", secretRef: "database-url" }],
              resources: { cpu: 0.25, memory: "0.5Gi" },
              command: MIGRATIONS_JOB_COMMAND
            }
          ],
          initContainers: [],
          volumes: []
        }
      }
    });
  });

  it("targets the ARM rest endpoint with the generated patch document", () => {
    const patchDocument = { properties: { template: { containers: [] } } };

    expect(
      buildMigrationsJobUpdateArgs({
        jobId:
          "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-example/providers/Microsoft.App/jobs/job-example",
        patchDocument
      })
    ).toEqual([
      "rest",
      "--method",
      "PATCH",
      "--uri",
      "https://management.azure.com/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-example/providers/Microsoft.App/jobs/job-example?api-version=2024-03-01",
      "--body",
      JSON.stringify(patchDocument, null, 2)
    ]);
  });

  it("includes execution template details in failure output", () => {
    const message = buildMigrationsFailureMessage({
      executionName: "job-example-abc123",
      status: "failed",
      execution: {
        properties: {
          startTime: "2026-03-08T01:39:01+00:00",
          template: {
            containers: [
              {
                image: "ghcr.io/example/migrations@sha256:abc",
                command: MIGRATIONS_JOB_COMMAND
              }
            ]
          }
        }
      }
    });

    expect(message).toContain("job-example-abc123");
    expect(message).toContain("ghcr.io/example/migrations@sha256:abc");
    expect(message).toContain("node packages/database/scripts/migrate.mjs up");
  });
});
