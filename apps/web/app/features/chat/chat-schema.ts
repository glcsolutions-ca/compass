import { z } from "zod";

export const ChatIntentSchema = z.enum(["sendMessage", "logout"]);
export const ChatExecutionModeSchema = z.enum(["cloud", "local"]).default("cloud");
export const ChatThreadIdSchema = z.string().trim().min(1).optional();

export const ChatPromptSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required.")
});

export type ChatIntent = z.infer<typeof ChatIntentSchema>;
