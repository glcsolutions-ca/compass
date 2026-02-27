export type AgentExecutionMode = "cloud" | "local";
export type AgentExecutionHost = "dynamic_sessions" | "desktop_local";
export type AgentThreadStatus = "idle" | "inProgress" | "completed" | "interrupted" | "error";

export interface AgentThread {
  threadId: string;
  workspaceId: string | null;
  workspaceSlug: string | null;
  executionMode: AgentExecutionMode;
  executionHost: AgentExecutionHost;
  status: AgentThreadStatus;
  title: string | null;
  cloudSessionIdentifier: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  modeSwitchedAt: string | null;
}

export interface AgentTurn {
  turnId: string;
  threadId: string;
  status: AgentThreadStatus;
  executionMode: AgentExecutionMode;
  executionHost: AgentExecutionHost;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: string | null;
  completedAt: string | null;
  outputText: string | null;
}

export interface AgentEvent {
  cursor: number;
  threadId: string;
  turnId: string | null;
  method: string;
  payload: unknown;
  createdAt: string;
}

export interface ChatParticipant {
  id: string;
  displayName: string;
  role: "user" | "assistant" | "system";
}

export type ChatTimelineItem =
  | {
      id: string;
      kind: "message";
      role: "user" | "assistant";
      text: string;
      turnId: string | null;
      cursor: number | null;
      streaming: boolean;
      createdAt: string | null;
    }
  | {
      id: string;
      kind: "status";
      label: string;
      detail: string | null;
      turnId: string | null;
      cursor: number | null;
      createdAt: string | null;
    }
  | {
      id: string;
      kind: "approval";
      label: string;
      detail: string | null;
      turnId: string | null;
      cursor: number | null;
      createdAt: string | null;
    }
  | {
      id: string;
      kind: "runtime";
      label: string;
      detail: string | null;
      payload: unknown;
      turnId: string | null;
      cursor: number | null;
      createdAt: string | null;
    }
  | {
      id: string;
      kind: "unknown";
      label: string;
      payload: unknown;
      turnId: string | null;
      cursor: number | null;
      createdAt: string | null;
    };

export interface ChatTransportState {
  lifecycle: "idle" | "connecting" | "open" | "polling" | "closed" | "error";
  cursor: number;
  reconnectCount: number;
  lastError: string | null;
}

export interface AgentEventsResult {
  events: AgentEvent[];
  nextCursor: number;
}
