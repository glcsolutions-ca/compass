import type { MetaFunction } from "react-router";
import { useActionData, useLoaderData } from "react-router";
import type { ShellRouteHandle } from "~/shell/shell-loader";
import type { WorkspacesActionData } from "./action";
import { submitWorkspacesAction } from "./action";
import type { WorkspacesLoaderData } from "./loader";
import { loadWorkspacesData } from "./loader";
import { WorkspacesView } from "./view";

export const meta: MetaFunction = () => {
  return [{ title: "Compass Workspaces" }];
};

export const handle: ShellRouteHandle = {
  requiresAuth: true,
  navLabel: "Workspaces"
};

export async function clientLoader(args: { request: Request }) {
  return loadWorkspacesData(args);
}

export async function clientAction(args: { request: Request }) {
  return submitWorkspacesAction(args);
}

export default function WorkspacesRoute() {
  const loaderData = useLoaderData<WorkspacesLoaderData>();
  const actionData = useActionData<WorkspacesActionData>();

  return <WorkspacesView actionData={actionData} loaderData={loaderData} />;
}
