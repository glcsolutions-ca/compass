import type {
  AccountLoginCompletedNotification,
  AccountRateLimitsUpdatedNotification,
  AccountUpdatedNotification,
  ChatgptAuthTokensRefreshParams,
  ChatgptAuthTokensRefreshResponse,
  CodexAuthMode,
  CodexServerNotification,
  CodexServerRequest,
  GetAccountRateLimitsResponse,
  GetAccountResponse,
  McpServerOauthLoginCompletedNotification,
  RateLimitSnapshot
} from "@compass/codex-protocol";

export type CodexInteractiveAuthMode = "chatgpt" | "apiKey" | "chatgptAuthTokens";

export interface CodexRpcClientOptions {
  command?: string;
  args?: string | string[];
  requestTimeoutMs?: number;
  turnTimeoutMs?: number;
  initTimeoutMs?: number;
  maxRestarts?: number;
  cwd?: string;
  autoLoginApiKey?: string | null;
  onStderr?: ((message: string) => void) | null;
  onChatgptAuthTokensRefresh?: (
    params: ChatgptAuthTokensRefreshParams
  ) => Promise<ChatgptAuthTokensRefreshResponse> | ChatgptAuthTokensRefreshResponse;
}

export interface CodexAccountStatus {
  type: string | null;
  email: string | null;
  name: string | null;
  label: string | null;
}

export interface CodexRuntimeAccountState {
  authMode: CodexAuthMode | null;
  requiresOpenaiAuth: boolean;
  account: {
    type: string | null;
    email: string | null;
    name: string | null;
    planType: string | null;
    label: string | null;
    raw: GetAccountResponse["account"] | null;
  };
}

export interface CodexLoginStartAccountResult {
  type: CodexInteractiveAuthMode;
  loginId: string | null;
  authUrl: string | null;
}

export interface CodexLoginStartResult {
  authenticated: boolean;
  accountLabel: string | null;
  authUrl: string | null;
  loginId?: string | null;
  mode: string | null;
}

export interface CodexRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface CodexRateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
  credits: RateLimitSnapshot["credits"] | null;
  planType: string | null;
}

export interface CodexRateLimitsState {
  rateLimits: CodexRateLimitSnapshot | null;
  rateLimitsByLimitId: Record<string, CodexRateLimitSnapshot | null> | null;
}

export interface CodexStartThreadResult {
  threadId: string;
}

export interface CodexRunTurnInput {
  threadId: string;
  turnId?: string;
  text: string;
  onDelta?: (delta: string) => void;
}

export interface CodexRunTurnResult {
  turnId: string;
  status: string;
  outputText: string;
  errorMessage: string | null;
}

export interface CodexInterruptResult {
  interrupted: boolean;
  reason?: string;
  threadId?: string;
  turnId?: string;
}

export interface CodexProcessHealth {
  command: string;
  args: string[];
  running: boolean;
  initialized: boolean;
  pid: number | null;
  readyAt: string | null;
  restartCount: number;
  lastError: string;
  stderrTail: string[];
  lastAuthMode: CodexAuthMode | null;
  lastRateLimits: CodexRateLimitSnapshot | null;
}

export interface CodexRpcNotification {
  method: CodexServerNotification["method"] | string;
  params: Record<string, unknown>;
}

export interface CodexRuntimeNotification {
  method:
    | "account/login/completed"
    | "account/updated"
    | "account/rateLimits/updated"
    | "mcpServer/oauthLogin/completed";
  params:
    | AccountLoginCompletedNotification
    | AccountUpdatedNotification
    | AccountRateLimitsUpdatedNotification
    | McpServerOauthLoginCompletedNotification;
}

export interface CodexRpcServerRequest {
  id: unknown;
  method: CodexServerRequest["method"] | string;
  params: Record<string, unknown>;
}

export class CodexJsonRpcClient {
  constructor(options?: CodexRpcClientOptions);

  ensureStarted(): Promise<void>;

  readAccountState(input?: { refreshToken?: boolean }): Promise<CodexRuntimeAccountState>;
  readRateLimits(): Promise<CodexRateLimitsState>;

  readAccount(): Promise<CodexAccountStatus>;

  loginStartAccount(input: {
    mode: CodexInteractiveAuthMode;
    apiKey?: string;
    accessToken?: string;
    chatgptAccountId?: string;
    chatgptPlanType?: string | null;
  }): Promise<CodexLoginStartAccountResult>;

  loginStart(input: {
    mode: CodexInteractiveAuthMode;
    apiKey?: string;
    accessToken?: string;
    chatgptAccountId?: string;
    chatgptPlanType?: string | null;
  }): Promise<CodexLoginStartResult>;

  loginCancel(input: { loginId: string }): Promise<unknown>;

  logoutAccount(): Promise<CodexRuntimeAccountState>;

  logout(): Promise<{ authenticated: boolean; accountLabel: string | null; mode: string | null }>;

  startThread(input?: { cwd?: string }): Promise<CodexStartThreadResult>;

  runTurn(input: CodexRunTurnInput): Promise<CodexRunTurnResult>;

  interruptTurn(input: {
    threadId?: string | null;
    turnId?: string | null;
  }): Promise<CodexInterruptResult>;

  subscribe(listener: (notification: CodexRpcNotification) => void): () => void;
  onServerRequest(
    handler: (request: CodexRpcServerRequest) => Promise<unknown> | unknown
  ): () => void;

  health(): CodexProcessHealth;

  stop(): Promise<void>;
}

export type {
  CodexAuthMode,
  GetAccountResponse,
  GetAccountRateLimitsResponse,
  ChatgptAuthTokensRefreshParams,
  ChatgptAuthTokensRefreshResponse
};
