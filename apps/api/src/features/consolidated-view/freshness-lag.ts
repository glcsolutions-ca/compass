export const DEFAULT_FRESHNESS_TARGET_SECONDS = 60;

export function calculateFreshnessLagSeconds(asOfIso: string, now: Date = new Date()): number {
  const asOfMs = Date.parse(asOfIso);

  if (Number.isNaN(asOfMs)) {
    throw new Error(`Invalid asOf timestamp: ${asOfIso}`);
  }

  return Math.max(0, Math.floor((now.getTime() - asOfMs) / 1000));
}

export function isWithinFreshnessTarget(
  asOfIso: string,
  now: Date = new Date(),
  targetSeconds: number = DEFAULT_FRESHNESS_TARGET_SECONDS
): boolean {
  return calculateFreshnessLagSeconds(asOfIso, now) <= targetSeconds;
}
