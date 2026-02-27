export const IPC_CHANNELS = {
  getAppVersion: "compass-desktop:get-app-version",
  openExternal: "compass-desktop:open-external",
  agentLocalLoginStart: "compass-desktop:agent-local-login-start",
  agentLocalLoginStatus: "compass-desktop:agent-local-login-status",
  agentLocalLoginCancel: "compass-desktop:agent-local-login-cancel",
  agentLocalLogout: "compass-desktop:agent-local-logout",
  agentLocalRateLimitsRead: "compass-desktop:agent-local-rate-limits-read",
  agentLocalTurnStart: "compass-desktop:agent-local-turn-start",
  agentLocalTurnInterrupt: "compass-desktop:agent-local-turn-interrupt",
  agentEvent: "compass-desktop:agent-event",
  agentRuntimeNotification: "compass-desktop:agent-runtime-notification"
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

export interface AgentLocalLoginCancelInput {
  loginId: string;
}

export interface AgentLocalTurnInterruptInput {
  turnId: string;
}
