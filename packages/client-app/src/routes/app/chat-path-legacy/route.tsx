import { redirect } from "react-router";
import { buildThreadHref } from "~/lib/routes/chat-routes";

export async function clientLoader({
  request,
  params
}: {
  request: Request;
  params: { threadHandle?: string };
}): Promise<Response> {
  const threadHandle = params.threadHandle?.trim();
  if (!threadHandle) {
    return redirect("/chat");
  }

  const requestUrl = new URL(request.url);
  const destination = new URL(buildThreadHref(threadHandle), "http://compass.local");
  destination.search = requestUrl.search;
  return redirect(`${destination.pathname}${destination.search}`);
}

export default function ChatPathLegacyRoute() {
  return null;
}
