import type {
  SessionHost,
  BootstrapSessionAgentInput,
  BootstrapSessionAgentResult
} from "../session-host.js";

export class MockSessionHost implements SessionHost {
  readonly executionHost = "desktop_local";
  readonly requiresPublicControlPlaneUrl = false;

  async bootstrapSessionAgent(
    _input: BootstrapSessionAgentInput
  ): Promise<BootstrapSessionAgentResult> {
    return {
      status: "mocked",
      pid: null
    };
  }
}
