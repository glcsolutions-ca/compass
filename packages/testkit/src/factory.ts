type AnyRecord = Record<string, unknown>;

export function createFactory<T extends AnyRecord>(base: T) {
  return (overrides: Partial<T> = {}): T => ({
    ...base,
    ...overrides
  });
}
