import { logoutAndRedirect } from "~/lib/auth/auth-session";
import { ChatIntentSchema, ChatPromptSchema } from "~/features/chat/chat-schema";

export interface ChatActionData {
  error: string | null;
  prompt: string | null;
  answer: string | null;
}

export async function submitTenantChatAction({
  request
}: {
  request: Request;
}): Promise<Response | ChatActionData> {
  const formData = await request.formData();
  const intentParse = ChatIntentSchema.safeParse(formData.get("intent"));

  if (!intentParse.success) {
    return {
      error: "Invalid chat action intent.",
      prompt: null,
      answer: null
    } satisfies ChatActionData;
  }

  if (intentParse.data === "logout") {
    return logoutAndRedirect(request);
  }

  const parsedPrompt = ChatPromptSchema.safeParse({
    prompt: formData.get("prompt")
  });

  if (!parsedPrompt.success) {
    return {
      error: parsedPrompt.error.issues[0]?.message ?? "Prompt is required.",
      prompt: null,
      answer: null
    } satisfies ChatActionData;
  }

  const prompt = parsedPrompt.data.prompt;

  return {
    error: null,
    prompt,
    answer:
      "Chat transport is intentionally staged. This shell is ready for codex gateway integration in the next phase."
  } satisfies ChatActionData;
}
