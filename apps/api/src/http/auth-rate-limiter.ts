interface RateLimitState {
  count: number;
  resetAtMs: number;
}

export const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS = 30;
export const DEFAULT_AUTH_RATE_LIMIT_MAX_ENTRIES = 10_000;

export class InMemoryRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, RateLimitState>();

  constructor(input: { windowMs: number; maxRequests: number; maxEntries: number }) {
    this.windowMs = input.windowMs;
    this.maxRequests = input.maxRequests;
    this.maxEntries = input.maxEntries;
  }

  check(input: { key: string; now: Date }): { allowed: boolean; retryAfterSeconds: number } {
    const nowMs = input.now.getTime();
    this.pruneExpiredEntries(nowMs);

    const existing = this.entries.get(input.key);
    if (!existing || existing.resetAtMs <= nowMs) {
      this.entries.set(input.key, {
        count: 1,
        resetAtMs: nowMs + this.windowMs
      });
      this.enforceEntryCap();
      return { allowed: true, retryAfterSeconds: Math.ceil(this.windowMs / 1000) };
    }

    if (existing.count >= this.maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000))
      };
    }

    existing.count += 1;
    this.entries.set(input.key, existing);
    return {
      allowed: true,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000))
    };
  }

  private pruneExpiredEntries(nowMs: number): void {
    for (const [key, state] of this.entries) {
      if (state.resetAtMs <= nowMs) {
        this.entries.delete(key);
      }
    }
  }

  private enforceEntryCap(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== "string") {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }
}
