import type { MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { submitTenantChatAction, type ChatActionData } from "~/features/chat/chat-action";
import { loadTenantChatData, type ChatLoaderData } from "~/features/chat/chat-loader";
import type { ShellRouteHandle } from "~/features/auth/types";

export const meta: MetaFunction = ({ params }) => {
  const slug = params.tenantSlug?.trim() || "workspace";
  return [{ title: `Compass Chat · ${slug}` }];
};

export const handle: ShellRouteHandle = {
  requiresAuth: true,
  requiresTenant: true,
  navLabel: "Chat"
};

export async function clientLoader({
  request,
  params
}: {
  request: Request;
  params: { tenantSlug?: string };
}): Promise<ChatLoaderData | Response> {
  return loadTenantChatData({ request, tenantSlug: params.tenantSlug });
}

export async function clientAction({
  request
}: {
  request: Request;
}): Promise<Response | ChatActionData> {
  return submitTenantChatAction({ request });
}

export default function ChatRoute() {
  const loaderData = useLoaderData<ChatLoaderData>();
  const actionData = useActionData<ChatActionData>();
  const navigation = useNavigation();
  const isSubmittingPrompt = navigation.formData?.get("intent") === "sendMessage";

  return (
    <section
      className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl flex-col"
      data-testid="tenant-chat-page"
    >
      <header className="mb-8 grid gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {loaderData.tenantName}
        </p>
        <h1 className="text-4xl font-medium tracking-tight">What&apos;s on the agenda today?</h1>
      </header>

      <div className="flex-1">
        {actionData?.prompt ? (
          <div className="grid gap-4">
            <article className="ml-auto max-w-[80%] rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-sm">{actionData.prompt}</p>
            </article>
            <article className="max-w-[80%] rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {actionData.answer}
            </article>
          </div>
        ) : (
          <div className="grid place-items-center py-12 text-center text-sm text-muted-foreground">
            <p>
              Start a conversation for workspace <strong>{loaderData.tenantSlug}</strong>.
            </p>
          </div>
        )}
      </div>

      <Form
        className="mx-auto mt-6 w-full max-w-3xl rounded-3xl border border-border bg-card/90 p-4 shadow-sm"
        method="post"
      >
        <input name="intent" type="hidden" value="sendMessage" />
        <div className="flex items-center gap-3">
          <Input
            autoComplete="off"
            className="h-11 border-0 bg-transparent text-base focus-visible:ring-0"
            name="prompt"
            placeholder="Ask anything"
          />
          <Button className="h-11 px-5" type="submit">
            {isSubmittingPrompt ? "Sending..." : "Send"}
          </Button>
        </div>
        {actionData?.error ? (
          <p className="mt-2 text-sm text-destructive">{actionData.error}</p>
        ) : null}
      </Form>
    </section>
  );
}
