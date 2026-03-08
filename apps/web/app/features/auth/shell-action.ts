import { logoutAndRedirect } from "~/lib/auth/auth-session";

export async function submitShellAction({ request }: { request: Request }): Promise<Response> {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "logout") {
    return logoutAndRedirect(request);
  }

  return new Response("Invalid shell action intent.", { status: 400 });
}
