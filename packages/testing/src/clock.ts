export function fixedClock(isoTimestamp: string): () => Date {
  const fixedInstant = new Date(isoTimestamp);

  if (Number.isNaN(fixedInstant.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${isoTimestamp}`);
  }

  return () => new Date(fixedInstant.getTime());
}
