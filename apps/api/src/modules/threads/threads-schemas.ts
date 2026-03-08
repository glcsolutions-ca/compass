import {
  ThreadEventsBatchRequestSchema,
  type ExecutionMode,
  type ThreadEventsBatchRequest,
  ThreadCreateRequestSchema,
  ThreadListQuerySchema,
  type ThreadListQuery,
  ThreadModePatchRequestSchema,
  type ThreadModePatchRequest,
  ThreadPatchRequestSchema,
  type ThreadPatchRequest,
  TurnStartRequestSchema,
  type TurnStartRequest
} from "@compass/contracts";
import { z } from "zod";

export const ThreadParamsSchema = z.object({
  threadId: z.string().min(1)
});

export const ThreadTurnParamsSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1)
});

export const ThreadEventsQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});

export {
  ThreadEventsBatchRequestSchema,
  ThreadCreateRequestSchema,
  ThreadListQuerySchema,
  ThreadModePatchRequestSchema,
  ThreadPatchRequestSchema,
  TurnStartRequestSchema,
  type ExecutionMode,
  type ThreadEventsBatchRequest,
  type ThreadListQuery,
  type ThreadModePatchRequest,
  type ThreadPatchRequest,
  type TurnStartRequest
};
