import type { ServiceBusReceivedMessage } from "@azure/service-bus";
import { SyncMessageSchema, type SyncMessage } from "@compass/contracts";

export function parseSyncMessage(raw: ServiceBusReceivedMessage): SyncMessage | null {
  if (!raw.body || typeof raw.body !== "object") {
    return null;
  }

  const parsed = SyncMessageSchema.safeParse(raw.body);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}
