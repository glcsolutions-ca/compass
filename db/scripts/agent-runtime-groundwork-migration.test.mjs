import { describe, expect, it } from "vitest";
import { up } from "../migrations/1772161000000_agent_runtime_groundwork.mjs";

describe("agent runtime groundwork migration", () => {
  it("renames codex tables to agent tables and adds mode columns", async () => {
    const renamedTables = [];
    const addedColumns = [];
    const renamedIndexes = [];

    const pgm = {
      renameTable(from, to) {
        renamedTables.push([String(from), String(to)]);
      },
      renameIndex(table, from, to) {
        renamedIndexes.push([String(table), String(from), String(to)]);
      },
      addColumns(table, columns) {
        addedColumns.push([String(table), Object.keys(columns)]);
      },
      addConstraint() {},
      createIndex() {},
      func(value) {
        return value;
      }
    };

    await up(pgm);

    expect(renamedTables).toEqual(
      expect.arrayContaining([
        ["codex_threads", "agent_threads"],
        ["codex_turns", "agent_turns"],
        ["codex_items", "agent_items"],
        ["codex_events", "agent_events"],
        ["codex_approvals", "agent_approvals"],
        ["codex_auth_state", "agent_auth_state"]
      ])
    );

    expect(renamedIndexes).toEqual(
      expect.arrayContaining([
        ["agent_events", "codex_events_thread_created_idx", "agent_events_thread_created_idx"],
        ["agent_turns", "codex_turns_thread_started_idx", "agent_turns_thread_started_idx"],
        ["agent_items", "codex_items_thread_updated_idx", "agent_items_thread_updated_idx"],
        [
          "agent_approvals",
          "codex_approvals_thread_created_idx",
          "agent_approvals_thread_created_idx"
        ]
      ])
    );

    expect(addedColumns).toEqual(
      expect.arrayContaining([
        [
          "agent_threads",
          [
            "tenant_id",
            "execution_mode",
            "execution_host",
            "cloud_session_identifier",
            "mode_switched_at"
          ]
        ],
        ["agent_turns", ["execution_mode", "execution_host", "runtime_metadata"]]
      ])
    );
  });
});
