export const IPC_CHANNELS = {
  getAppVersion: "compass-desktop:get-app-version",
  openExternal: "compass-desktop:open-external",
  agentLocalLoginStart: "compass-desktop:agent-local-login-start",
  agentLocalLoginStatus: "compass-desktop:agent-local-login-status",
  agentLocalLogout: "compass-desktop:agent-local-logout",
  agentLocalTurnStart: "compass-desktop:agent-local-turn-start",
  agentLocalTurnInterrupt: "compass-desktop:agent-local-turn-interrupt",
  agentEvent: "compass-desktop:agent-event"
} as const;

export interface AgentLocalLoginStartInput {
  mode: "chatgpt" | "apiKey";
  apiKey?: string;
}

export interface AgentLocalTurnStartInput {
  threadId: string;
  text: string;
  turnId?: string;
}

export interface AgentLocalTurnInterruptInput {
  turnId: string;
}
