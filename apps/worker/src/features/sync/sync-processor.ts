import type { SyncMessage } from "@compass/contracts";

export interface ProcessOptions {
  maxAttempts?: number;
  shouldFailTransiently?: (message: SyncMessage) => boolean;
}

export interface ProcessResult {
  status: "processed" | "duplicate" | "retry" | "dead-letter";
  reason: string;
}

export class InMemoryIdempotencyStore {
  private readonly seen = new Set<string>();

  has(messageId: string): boolean {
    return this.seen.has(messageId);
  }

  mark(messageId: string): void {
    this.seen.add(messageId);
  }
}

export function processSyncMessage(
  message: SyncMessage,
  store: InMemoryIdempotencyStore,
  options: ProcessOptions = {}
): ProcessResult {
  const maxAttempts = options.maxAttempts ?? 5;

  if (store.has(message.id)) {
    return {
      status: "duplicate",
      reason: "Message already processed"
    };
  }

  if (message.attempt >= maxAttempts) {
    return {
      status: "dead-letter",
      reason: `Max attempts reached (${maxAttempts})`
    };
  }

  if (options.shouldFailTransiently?.(message)) {
    return {
      status: "retry",
      reason: "Transient processing failure"
    };
  }

  store.mark(message.id);

  return {
    status: "processed",
    reason: "Message processed and marked idempotent"
  };
}
