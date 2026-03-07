export interface EventEnvelopeFixture {
  id: string;
  eventType: string;
  source: string;
  occurredAt: string;
  attempt: number;
  payload: unknown;
}

export interface ServiceBusMessageFixture {
  body: unknown;
  deliveryCount: number;
  messageId: string;
}

export function createEventEnvelopeFixture(
  overrides: Partial<EventEnvelopeFixture> = {}
): EventEnvelopeFixture {
  return {
    id: "evt-1",
    eventType: "system.ping",
    source: "tests",
    occurredAt: "2026-02-25T00:00:00.000Z",
    attempt: 0,
    payload: { ok: true },
    ...overrides
  };
}

export function createServiceBusMessageFixture(
  overrides: Partial<ServiceBusMessageFixture> = {}
): ServiceBusMessageFixture {
  const envelope = createEventEnvelopeFixture();
  return {
    body: envelope,
    deliveryCount: 1,
    messageId: envelope.id,
    ...overrides
  };
}
