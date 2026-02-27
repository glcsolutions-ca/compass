import { z } from "zod";

export const ChatIntentSchema = z.enum(["sendMessage", "interruptTurn", "switchMode", "logout"]);

export const ChatPromptSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required.")
});

export const ChatThreadIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_:-]+$/u)
  .optional();

export const ChatTurnIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_:-]+$/u)
  .optional();

export const ChatExecutionModeSchema = z.enum(["cloud", "local"]);

export type ChatIntent = z.infer<typeof ChatIntentSchema>;
