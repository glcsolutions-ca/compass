import { describe, expect, it } from "vitest";
import { down, up } from "../migrations/1772186000000_agent_session_identifier.mjs";

describe("agent session identifier migration", () => {
  it("renames the thread session identifier column and index", async () => {
    const renamedColumns = [];
    const sqlStatements = [];

    const pgm = {
      renameColumn(table, from, to) {
        renamedColumns.push([String(table), String(from), String(to)]);
      },
      sql(statement) {
        sqlStatements.push(String(statement));
      }
    };

    await up(pgm);

    expect(renamedColumns).toContainEqual([
      "agent_threads",
      "cloud_session_identifier",
      "session_identifier"
    ]);
    expect(sqlStatements).toContain(
      'alter index if exists "agent_threads_cloud_session_identifier_uidx" rename to "agent_threads_session_identifier_uidx";'
    );
  });

  it("restores the previous column and index names on downgrade", async () => {
    const renamedColumns = [];
    const sqlStatements = [];

    const pgm = {
      renameColumn(table, from, to) {
        renamedColumns.push([String(table), String(from), String(to)]);
      },
      sql(statement) {
        sqlStatements.push(String(statement));
      }
    };

    await down(pgm);

    expect(renamedColumns).toContainEqual([
      "agent_threads",
      "session_identifier",
      "cloud_session_identifier"
    ]);
    expect(sqlStatements).toContain(
      'alter index if exists "agent_threads_session_identifier_uidx" rename to "agent_threads_cloud_session_identifier_uidx";'
    );
  });
});
