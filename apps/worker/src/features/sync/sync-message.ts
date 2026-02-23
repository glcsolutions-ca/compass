import type { ServiceBusReceivedMessage } from "@azure/service-bus";
import { EventEnvelopeSchema, type EventEnvelope } from "@compass/contracts";

function normalizeBody(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
    try {
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  return body;
}

export function parseSyncMessage(raw: ServiceBusReceivedMessage): EventEnvelope | null {
  const normalizedBody = normalizeBody(raw.body);

  if (!normalizedBody || typeof normalizedBody !== "object") {
    return null;
  }

  const parsed = EventEnvelopeSchema.safeParse(normalizedBody);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}
