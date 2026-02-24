import { StreamEventSchema, type StreamEvent } from "@compass/contracts";

export interface ApprovalRequest {
  requestId: string;
  payload: Record<string, unknown>;
}

export interface StreamState {
  events: StreamEvent[];
  pendingApprovals: ApprovalRequest[];
}

export function createStreamState(): StreamState {
  return {
    events: [],
    pendingApprovals: []
  };
}

export function reduceStreamEvent(state: StreamState, event: StreamEvent): StreamState {
  const events = [...state.events.slice(-99), event];

  if (event.type === "approval.requested" && event.requestId) {
    const payload =
      event.payload && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>)
        : {};

    const deduped = state.pendingApprovals.filter((entry) => entry.requestId !== event.requestId);
    return {
      events,
      pendingApprovals: [...deduped, { requestId: event.requestId, payload }]
    };
  }

  if (event.type === "approval.resolved" && event.requestId) {
    return {
      events,
      pendingApprovals: state.pendingApprovals.filter(
        (entry) => entry.requestId !== event.requestId
      )
    };
  }

  return {
    events,
    pendingApprovals: state.pendingApprovals
  };
}

export function parseStreamEventMessage(data: unknown): StreamEvent | null {
  if (typeof data !== "string") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  const result = StreamEventSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function readApprovalReason(payload: Record<string, unknown>): string {
  const reason = payload.reason;
  if (typeof reason === "string" && reason.trim().length > 0) {
    return reason;
  }

  return "Approval required";
}
