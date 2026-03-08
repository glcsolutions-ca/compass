import {
  ExecutionHostSchema,
  ExecutionModeSchema,
  type ExecutionHost,
  type ExecutionMode
} from "@compass/contracts";
import type { ThreadEventRecord, ThreadRecord, TurnRecord } from "./thread-service.js";

export function parseExecutionMode(value: string): ExecutionMode {
  const parsed = ExecutionModeSchema.safeParse(value);
  if (!parsed.success) {
    return "cloud";
  }
  return parsed.data;
}

export function parseExecutionHost(value: string): ExecutionHost {
  const parsed = ExecutionHostSchema.safeParse(value);
  if (!parsed.success) {
    return "dynamic_sessions";
  }
  return parsed.data;
}

export function readRecordString(row: Record<string, unknown>, key: string, fallback = ""): string {
  const value = row[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function readRecordNullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function readRecordBoolean(row: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = row[key];
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "t" || normalized === "1") {
      return true;
    }

    if (normalized === "false" || normalized === "f" || normalized === "0") {
      return false;
    }
  }

  return fallback;
}

function coerceIsoDate(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function readRecordIsoDate(row: Record<string, unknown>, key: string): string {
  const isoDate = coerceIsoDate(row[key]);
  if (isoDate) {
    return isoDate;
  }

  throw new RangeError(`Invalid ${key} timestamp value`);
}

function readRecordNullableIsoDate(row: Record<string, unknown>, key: string): string | null {
  return coerceIsoDate(row[key]);
}

export function mapThreadRow(row: Record<string, unknown>): ThreadRecord {
  const executionModeValue = readRecordString(row, "execution_mode", "cloud");
  const executionHostValue = readRecordString(row, "execution_host", "dynamic_sessions");
  const statusValue = readRecordString(row, "status", "idle");

  return {
    threadId: readRecordString(row, "thread_id"),
    workspaceId: readRecordString(row, "workspace_id"),
    workspaceSlug: readRecordString(row, "workspace_slug"),
    executionMode: parseExecutionMode(executionModeValue),
    executionHost: parseExecutionHost(executionHostValue),
    status: statusValue as ThreadRecord["status"],
    sessionIdentifier: readRecordNullableString(row, "session_identifier"),
    title: readRecordNullableString(row, "title"),
    archived: readRecordBoolean(row, "archived", false),
    createdAt: readRecordIsoDate(row, "created_at"),
    updatedAt: readRecordIsoDate(row, "updated_at"),
    modeSwitchedAt: readRecordNullableIsoDate(row, "mode_switched_at")
  };
}

export function mapTurnRow(row: Record<string, unknown>): TurnRecord {
  const statusValue = readRecordString(row, "status", "idle");
  const executionModeValue = readRecordString(row, "execution_mode", "cloud");
  const executionHostValue = readRecordString(row, "execution_host", "dynamic_sessions");

  return {
    turnId: readRecordString(row, "turn_id"),
    threadId: readRecordString(row, "thread_id"),
    parentTurnId: readRecordNullableString(row, "parent_turn_id"),
    sourceTurnId: readRecordNullableString(row, "source_turn_id"),
    clientRequestId: readRecordNullableString(row, "client_request_id"),
    status: statusValue as TurnRecord["status"],
    executionMode: parseExecutionMode(executionModeValue),
    executionHost: parseExecutionHost(executionHostValue),
    input: row.input ?? null,
    output: row.output ?? null,
    error: row.error ?? null,
    startedAt: readRecordIsoDate(row, "started_at"),
    completedAt: readRecordNullableIsoDate(row, "completed_at")
  };
}

export function mapEventRow(row: Record<string, unknown>): ThreadEventRecord {
  return {
    cursor: Number(row.id),
    threadId: readRecordString(row, "thread_id"),
    turnId: readRecordNullableString(row, "turn_id"),
    method: readRecordString(row, "method"),
    payload: row.payload ?? {},
    createdAt: readRecordIsoDate(row, "created_at")
  };
}

export function readTurnOutputText(turn: TurnRecord): string | null {
  if (!turn.output || typeof turn.output !== "object") {
    return null;
  }

  const outputText = (turn.output as { text?: unknown }).text;
  return typeof outputText === "string" && outputText.length > 0 ? outputText : null;
}

export const __internalThreadServiceMapping = {
  mapThreadRow,
  mapTurnRow,
  mapEventRow
};
