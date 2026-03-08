import type {
  ThreadEvent as ContractThreadEvent,
  ExecutionHost as ContractExecutionHost,
  ExecutionMode as ContractExecutionMode,
  Thread as ContractThread,
  ThreadStatus as ContractThreadStatus,
  Turn as ContractTurn
} from "@compass/contracts";

export type ChatExecutionMode = ContractExecutionMode;
export type ChatExecutionHost = ContractExecutionHost;
export type ChatThreadStatus = ContractThreadStatus;
export type ChatThread = ContractThread;
export type ChatTurn = ContractTurn & {
  outputText: string | null;
};
export type ChatEvent = ContractThreadEvent;

export interface ChatParticipant {
  id: string;
  displayName: string;
  role: "user" | "assistant" | "system";
}

export type ChatTimelineTextPart = {
  type: "text";
  text: string;
  parentId?: string;
};

export type ChatTimelineReasoningPart = {
  type: "reasoning";
  text: string;
  parentId?: string;
};

export type ChatTimelineToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  argsText: string;
  args: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  parentId?: string;
};

export type ChatTimelineDataPart = {
  type: "data";
  name: string;
  data: unknown;
};

export type ChatTimelineMessagePart =
  | ChatTimelineTextPart
  | ChatTimelineReasoningPart
  | ChatTimelineToolCallPart
  | ChatTimelineDataPart;

export type ChatTimelineItem =
  | {
      id: string;
      kind: "message";
      role: "user" | "assistant";
      text: string;
      parts: ChatTimelineMessagePart[];
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

export interface ChatEventsResult {
  events: ChatEvent[];
  nextCursor: number;
}
