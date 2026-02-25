import type { ServiceBusReceivedMessage } from "@azure/service-bus";

export type SettlementAction = "ack" | "retry" | "dead-letter";

export function classifySettlement(
  message: ServiceBusReceivedMessage,
  error: unknown,
  maxDeliveryAttempts = 5
): SettlementAction {
  const attempts = Number(message.deliveryCount ?? 0);

  if (!error) {
    return "ack";
  }

  if (attempts >= maxDeliveryAttempts) {
    return "dead-letter";
  }

  return "retry";
}
