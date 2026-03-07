import { z } from "zod";

const RuntimeDescriptorSchema = z.object({
  sessionIdentifier: z.string().min(1),
  bootId: z.string().min(1),
  runtimeKind: z.string().min(1),
  pid: z.number().int().positive().nullable().optional()
});

export const SessionAgentHelloMessageSchema = z.object({
  type: z.literal("session.hello"),
  sessionIdentifier: z.string().min(1),
  bootId: z.string().min(1),
  runtimeKind: z.string().min(1),
  pid: z.number().int().positive(),
  connectedAt: z.string().datetime()
});

export const SessionAgentHeartbeatMessageSchema = z.object({
  type: z.literal("session.heartbeat"),
  sessionIdentifier: z.string().min(1),
  bootId: z.string().min(1),
  pid: z.number().int().positive(),
  sentAt: z.string().datetime()
});

export const SessionAgentTurnResultMessageSchema = z.object({
  type: z.literal("turn.result"),
  requestId: z.string().min(1),
  turnId: z.string().min(1),
  outputText: z.string(),
  runtime: RuntimeDescriptorSchema
});

export const SessionAgentTurnInterruptedMessageSchema = z.object({
  type: z.literal("turn.interrupted"),
  requestId: z.string().min(1),
  turnId: z.string().min(1),
  runtime: RuntimeDescriptorSchema
});

export const SessionAgentTurnErrorMessageSchema = z.object({
  type: z.literal("turn.error"),
  requestId: z.string().min(1),
  turnId: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1)
});

export const SessionAgentInboundMessageSchema = z.discriminatedUnion("type", [
  SessionAgentHelloMessageSchema,
  SessionAgentHeartbeatMessageSchema,
  SessionAgentTurnResultMessageSchema,
  SessionAgentTurnInterruptedMessageSchema,
  SessionAgentTurnErrorMessageSchema
]);

export const ControlPlaneTurnRunMessageSchema = z.object({
  type: z.literal("turn.run"),
  requestId: z.string().min(1),
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  text: z.string()
});

export const ControlPlaneTurnInterruptMessageSchema = z.object({
  type: z.literal("turn.interrupt"),
  requestId: z.string().min(1),
  threadId: z.string().min(1),
  turnId: z.string().min(1)
});

export const ControlPlaneSessionCloseMessageSchema = z.object({
  type: z.literal("session.close"),
  reason: z.string().min(1)
});

export const ControlPlaneOutboundMessageSchema = z.discriminatedUnion("type", [
  ControlPlaneTurnRunMessageSchema,
  ControlPlaneTurnInterruptMessageSchema,
  ControlPlaneSessionCloseMessageSchema
]);

export type SessionRuntimeDescriptor = z.infer<typeof RuntimeDescriptorSchema>;
export type SessionAgentHelloMessage = z.infer<typeof SessionAgentHelloMessageSchema>;
export type SessionAgentHeartbeatMessage = z.infer<typeof SessionAgentHeartbeatMessageSchema>;
export type SessionAgentTurnResultMessage = z.infer<typeof SessionAgentTurnResultMessageSchema>;
export type SessionAgentTurnInterruptedMessage = z.infer<
  typeof SessionAgentTurnInterruptedMessageSchema
>;
export type SessionAgentTurnErrorMessage = z.infer<typeof SessionAgentTurnErrorMessageSchema>;
export type SessionAgentInboundMessage = z.infer<typeof SessionAgentInboundMessageSchema>;
export type ControlPlaneTurnRunMessage = z.infer<typeof ControlPlaneTurnRunMessageSchema>;
export type ControlPlaneTurnInterruptMessage = z.infer<
  typeof ControlPlaneTurnInterruptMessageSchema
>;
export type ControlPlaneSessionCloseMessage = z.infer<typeof ControlPlaneSessionCloseMessageSchema>;
export type ControlPlaneOutboundMessage = z.infer<typeof ControlPlaneOutboundMessageSchema>;
