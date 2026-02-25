import { redirect } from "next/navigation";
import { readEnterpriseAuthState } from "../_lib/server/enterprise-session";
import { WorkspaceShell } from "./_components/workspace-shell";

export default async function WorkspacePage() {
  const { config, session } = await readEnterpriseAuthState();
  if (config.entraLoginEnabled && !config.devFallbackEnabled && !session) {
    redirect("/login?next=%2F");
  }

  return <WorkspaceShell session={session} devFallbackEnabled={config.devFallbackEnabled} />;
}
