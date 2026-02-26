import { useLoaderData } from "react-router";
import type { AuthShellLoaderData } from "~/shell/shell-loader";
import { loadAppRootData } from "./loader";
import { AppRootView } from "./view";

export async function clientLoader(args: { request: Request }) {
  return loadAppRootData(args);
}

export default function AppRootRoute() {
  const data = useLoaderData<AuthShellLoaderData>();
  return <AppRootView data={data} />;
}
