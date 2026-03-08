import type {
  ExecutionHost,
  ExecutionMode,
  RuntimeNotificationMethod,
  RuntimeProvider as ContractRuntimeProvider
} from "@compass/contracts";

export interface ThreadRecord {
  threadId: string;
  workspaceId: string;
  workspaceSlug: string;
  executionMode: ExecutionMode;
  executionHost: ExecutionHost;
  status: "idle" | "inProgress" | "completed" | "interrupted" | "error";
  sessionIdentifier: string | null;
  title: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  modeSwitchedAt: string | null;
}

export interface TurnRecord {
  turnId: string;
  threadId: string;
  parentTurnId: string | null;
  sourceTurnId: string | null;
  clientRequestId: string | null;
  status: "idle" | "inProgress" | "completed" | "interrupted" | "error";
  executionMode: ExecutionMode;
  executionHost: ExecutionHost;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: string;
  completedAt: string | null;
}

export interface ThreadEventRecord {
  cursor: number;
  threadId: string;
  turnId: string | null;
  method: string;
  payload: unknown;
  createdAt: string;
}

export type RuntimeProvider = ContractRuntimeProvider;

export interface RuntimeNotificationRecord {
  cursor: number;
  method: RuntimeNotificationMethod;
  params: unknown;
  createdAt: string;
}
