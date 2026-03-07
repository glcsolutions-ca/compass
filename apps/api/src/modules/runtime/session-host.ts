import type { ExecutionHost } from "@compass/contracts";

export interface BootstrapSessionAgentInput {
  sessionIdentifier: string;
  bootId: string;
  connectToken: string;
  controlPlaneUrl: string;
  forceRestart: boolean;
}

export interface BootstrapSessionAgentResult {
  status: string;
  pid: number | null;
}

export interface SessionHost {
  readonly executionHost: ExecutionHost;
  readonly requiresPublicControlPlaneUrl: boolean;
  bootstrapSessionAgent(input: BootstrapSessionAgentInput): Promise<BootstrapSessionAgentResult>;
}
