import {
  type AgentLocalLoginCancelInput,
  type AgentLocalLoginStartInput,
  type AgentLocalTurnInterruptInput,
  type AgentLocalTurnStartInput,
  IPC_CHANNELS
} from "./ipc";
import { assertExternalOpenAllowed } from "./navigation-policy";
import type {
  RuntimeAccountLoginCancelResponse,
  RuntimeAccountLoginStartResponse,
  RuntimeAccountLogoutResponse,
  RuntimeAccountRateLimitsReadResponse,
  RuntimeAccountReadResponse,
  RuntimeNotification
} from "@compass/contracts" with { "resolution-mode": "import" };

export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  sendSync(channel: string, ...args: unknown[]): unknown;
  on(channel: string, listener: (...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (...args: unknown[]) => void): void;
}

export type DesktopRuntimeAccountState = RuntimeAccountReadResponse;
export type DesktopRuntimeLoginStartResponse = RuntimeAccountLoginStartResponse;
export type DesktopRuntimeRateLimits = RuntimeAccountRateLimitsReadResponse;
export type DesktopRuntimeNotification = RuntimeNotification;

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
  status: "completed" | "interrupted" | "failed";
  outputText: string;
  sessionId: string;
  executionMode: "local";
  executionHost: "desktop_local";
}

export interface CompassDesktopApi {
  getAppVersion(): string;
  openExternal(url: string): Promise<void>;
  localAuthStart(input: AgentLocalLoginStartInput): Promise<DesktopRuntimeLoginStartResponse>;
  localAuthStatus(): Promise<DesktopRuntimeAccountState>;
  localAuthCancel(input: AgentLocalLoginCancelInput): Promise<RuntimeAccountLoginCancelResponse>;
  localAuthLogout(): Promise<RuntimeAccountLogoutResponse>;
  localRateLimitsRead(): Promise<DesktopRuntimeRateLimits>;
  localTurnStart(input: AgentLocalTurnStartInput): Promise<DesktopLocalTurnResult>;
  localTurnInterrupt(
    input: AgentLocalTurnInterruptInput
  ): Promise<{ turnId: string; status: string }>;
  onAgentEvent(listener: (event: DesktopAgentEvent) => void): () => void;
  onRuntimeNotification(listener: (event: DesktopRuntimeNotification) => void): () => void;
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
    async localAuthStart(
      input: AgentLocalLoginStartInput
    ): Promise<DesktopRuntimeLoginStartResponse> {
      return (await ipcRenderer.invoke(
        IPC_CHANNELS.agentLocalLoginStart,
        input
      )) as DesktopRuntimeLoginStartResponse;
    },
    async localAuthStatus(): Promise<DesktopRuntimeAccountState> {
      return (await ipcRenderer.invoke(
        IPC_CHANNELS.agentLocalLoginStatus
      )) as DesktopRuntimeAccountState;
    },
    async localAuthCancel(
      input: AgentLocalLoginCancelInput
    ): Promise<RuntimeAccountLoginCancelResponse> {
      return (await ipcRenderer.invoke(
        IPC_CHANNELS.agentLocalLoginCancel,
        input
      )) as RuntimeAccountLoginCancelResponse;
    },
    async localAuthLogout(): Promise<RuntimeAccountLogoutResponse> {
      return (await ipcRenderer.invoke(
        IPC_CHANNELS.agentLocalLogout
      )) as RuntimeAccountLogoutResponse;
    },
    async localRateLimitsRead(): Promise<DesktopRuntimeRateLimits> {
      return (await ipcRenderer.invoke(
        IPC_CHANNELS.agentLocalRateLimitsRead
      )) as DesktopRuntimeRateLimits;
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
    onRuntimeNotification(listener: (event: DesktopRuntimeNotification) => void): () => void {
      const handler = (_event: unknown, payload: unknown) => {
        listener(payload as DesktopRuntimeNotification);
      };

      ipcRenderer.on(IPC_CHANNELS.agentRuntimeNotification, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.agentRuntimeNotification, handler);
      };
    },
    isDesktop() {
      return true;
    }
  };
}
