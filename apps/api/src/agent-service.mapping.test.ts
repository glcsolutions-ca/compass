import { describe, expect, it } from "vitest";
import { __internalAgentServiceMapping } from "./agent-service.js";

describe("agent service row mapping", () => {
  it("maps thread rows that contain Date timestamp objects", () => {
    const createdAt = new Date("2026-02-27T12:00:00.000Z");
    const updatedAt = new Date("2026-02-27T12:01:00.000Z");

    const mapped = __internalAgentServiceMapping.mapThreadRow({
      thread_id: "thread-1",
      workspace_id: "workspace-1",
      workspace_slug: "personal-user-1",
      execution_mode: "cloud",
      execution_host: "dynamic_sessions",
      status: "idle",
      cloud_session_identifier: "thr-thread-1",
      title: "Smoke",
      created_at: createdAt,
      updated_at: updatedAt,
      mode_switched_at: null
    });

    expect(mapped.createdAt).toBe(createdAt.toISOString());
    expect(mapped.updatedAt).toBe(updatedAt.toISOString());
  });

  it("maps turn rows that contain Date timestamp objects", () => {
    const startedAt = new Date("2026-02-27T12:00:00.000Z");
    const completedAt = new Date("2026-02-27T12:00:30.000Z");

    const mapped = __internalAgentServiceMapping.mapTurnRow({
      turn_id: "turn-1",
      thread_id: "thread-1",
      status: "completed",
      execution_mode: "cloud",
      execution_host: "dynamic_sessions",
      input: {},
      output: {},
      error: null,
      started_at: startedAt,
      completed_at: completedAt
    });

    expect(mapped.startedAt).toBe(startedAt.toISOString());
    expect(mapped.completedAt).toBe(completedAt.toISOString());
  });

  it("maps event rows that contain Date timestamp objects", () => {
    const createdAt = new Date("2026-02-27T12:00:00.000Z");

    const mapped = __internalAgentServiceMapping.mapEventRow({
      id: 7,
      thread_id: "thread-1",
      turn_id: "turn-1",
      method: "turn.started",
      payload: { text: "hello" },
      created_at: createdAt
    });

    expect(mapped.cursor).toBe(7);
    expect(mapped.createdAt).toBe(createdAt.toISOString());
  });
});
