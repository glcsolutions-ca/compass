import { z } from "zod";

export const EventEnvelopeSchema = z.object({
  id: z.string().min(1),
  eventType: z.string().min(1),
  source: z.string().min(1),
  occurredAt: z.string().datetime(),
  attempt: z.number().int().nonnegative().default(0),
  payload: z.unknown()
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
