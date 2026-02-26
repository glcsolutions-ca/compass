import type { MetaFunction } from "react-router";
import { useActionData, useLoaderData } from "react-router";
import type { ShellRouteHandle } from "~/shell/shell-loader";
import type { ChatActionData } from "./action";
import { submitTenantChatAction } from "./action";
import type { ChatLoaderData } from "./loader";
import { loadTenantChatData } from "./loader";
import { TenantChatView } from "./view";

export const meta: MetaFunction = ({ params }) => {
  const slug = params.tenantSlug?.trim() || "workspace";
  return [{ title: `Compass Chat · ${slug}` }];
};

export const handle: ShellRouteHandle = {
  requiresAuth: true,
  requiresTenant: true,
  navLabel: "Chat"
};

export async function clientLoader(args: { request: Request; params: { tenantSlug?: string } }) {
  return loadTenantChatData(args);
}

export async function clientAction(args: { request: Request }) {
  return submitTenantChatAction(args);
}

export default function TenantChatRoute() {
  const loaderData = useLoaderData<ChatLoaderData>();
  const actionData = useActionData<ChatActionData>();

  return <TenantChatView actionData={actionData} loaderData={loaderData} />;
}
