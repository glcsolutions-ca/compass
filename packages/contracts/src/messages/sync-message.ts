import { z } from "zod";

export const SyncMessageSchema = z.object({
  id: z.string().min(1),
  employeeId: z.string().min(1),
  sourceSystem: z.string().min(1),
  occurredAt: z.string().min(1),
  attempt: z.number().int().nonnegative().default(0)
});

export type SyncMessage = z.infer<typeof SyncMessageSchema>;
