import {
  type AgentLocalLoginStartInput,
  type AgentLocalTurnInterruptInput,
  type AgentLocalTurnStartInput,
  IPC_CHANNELS
} from "./ipc";
import { assertExternalOpenAllowed } from "./navigation-policy";

export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  sendSync(channel: string, ...args: unknown[]): unknown;
  on(channel: string, listener: (...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (...args: unknown[]) => void): void;
}

export interface DesktopAgentAuthState {
  authenticated: boolean;
  mode: "chatgpt" | "apiKey" | null;
  account: {
    label: string;
  } | null;
  updatedAt: string | null;
  authUrl?: string | null;
}

export interface DesktopAgentEvent {
  cursor: number;
  threadId: string;
  turnId: string;
  type: "turn.started" | "item.delta" | "turn.completed";
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DesktopLocalTurnResult {
  turnId: string;
  status: "completed";
  outputText: string;
  sessionId: string;
  executionMode: "local";
  executionHost: "desktop_local";
}

export interface CompassDesktopApi {
  getAppVersion(): string;
  openExternal(url: string): Promise<void>;
  localAuthStart(input: AgentLocalLoginStartInput): Promise<DesktopAgentAuthState>;
  localAuthStatus(): Promise<DesktopAgentAuthState>;
  localAuthLogout(): Promise<DesktopAgentAuthState>;
  localTurnStart(input: AgentLocalTurnStartInput): Promise<DesktopLocalTurnResult>;
  localTurnInterrupt(
    input: AgentLocalTurnInterruptInput
  ): Promise<{ turnId: string; status: string }>;
  onAgentEvent(listener: (event: DesktopAgentEvent) => void): () => void;
  isDesktop(): true;
}

export function createCompassDesktopApi(ipcRenderer: IpcRendererLike): CompassDesktopApi {
  return {
    getAppVersion() {
      const version = ipcRenderer.sendSync(IPC_CHANNELS.getAppVersion);

      if (typeof version !== "string") {
        throw new Error("Desktop API returned an invalid app version.");
      }

      return version;
    },
    async openExternal(url: string): Promise<void> {
      const parsed = assertExternalOpenAllowed(url);
      await ipcRenderer.invoke(IPC_CHANNELS.openExternal, parsed.toString());
    },
    async localAuthStart(input: AgentLocalLoginStartInput): Promise<DesktopAgentAuthState> {
      return (await ipcRenderer.invoke(
        IPC_CHANNELS.agentLocalLoginStart,
        input
      )) as DesktopAgentAuthState;
    },
    async localAuthStatus(): Promise<DesktopAgentAuthState> {
      return (await ipcRenderer.invoke(
        IPC_CHANNELS.agentLocalLoginStatus
      )) as DesktopAgentAuthState;
    },
    async localAuthLogout(): Promise<DesktopAgentAuthState> {
      return (await ipcRenderer.invoke(IPC_CHANNELS.agentLocalLogout)) as DesktopAgentAuthState;
    },
    async localTurnStart(input: AgentLocalTurnStartInput): Promise<DesktopLocalTurnResult> {
      return (await ipcRenderer.invoke(
        IPC_CHANNELS.agentLocalTurnStart,
        input
      )) as DesktopLocalTurnResult;
    },
    async localTurnInterrupt(
      input: AgentLocalTurnInterruptInput
    ): Promise<{ turnId: string; status: string }> {
      return (await ipcRenderer.invoke(IPC_CHANNELS.agentLocalTurnInterrupt, input)) as {
        turnId: string;
        status: string;
      };
    },
    onAgentEvent(listener: (event: DesktopAgentEvent) => void): () => void {
      const handler = (_event: unknown, payload: unknown) => {
        listener(payload as DesktopAgentEvent);
      };

      ipcRenderer.on(IPC_CHANNELS.agentEvent, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler);
      };
    },
    isDesktop() {
      return true;
    }
  };
}
