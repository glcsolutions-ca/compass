import type {
  RuntimeAccountLoginCancelResponse,
  RuntimeAccountLoginStartResponse,
  RuntimeAccountLogoutResponse,
  RuntimeAccountRateLimitsReadResponse,
  RuntimeAccountReadResponse,
  RuntimeNotification
} from "@compass/contracts";

export interface DesktopRuntimeApi {
  localAuthStart: (input: {
    mode: "chatgpt" | "apiKey";
    apiKey?: string;
  }) => Promise<RuntimeAccountLoginStartResponse>;
  localAuthStatus: () => Promise<RuntimeAccountReadResponse>;
  localAuthLogout: () => Promise<RuntimeAccountLogoutResponse>;
  localAuthCancel?: (input: { loginId: string }) => Promise<RuntimeAccountLoginCancelResponse>;
  localRateLimitsRead?: () => Promise<RuntimeAccountRateLimitsReadResponse>;
  onRuntimeNotification?: (listener: (event: RuntimeNotification) => void) => () => void;
  openExternal?: (url: string) => Promise<void>;
}

export const LOCAL_DEFAULT_STATE: RuntimeAccountReadResponse = {
  provider: "local_process",
  capabilities: {
    interactiveAuth: true,
    supportsChatgptManaged: true,
    supportsApiKey: true,
    supportsChatgptAuthTokens: false,
    supportsRateLimits: false,
    supportsRuntimeStream: false
  },
  authMode: null,
  requiresOpenaiAuth: true,
  account: null
};

export function readDesktopRuntimeApi(): DesktopRuntimeApi | null {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = (window as { compassDesktop?: unknown }).compassDesktop;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const desktopApi = candidate as DesktopRuntimeApi;
  if (
    typeof desktopApi.localAuthStart !== "function" ||
    typeof desktopApi.localAuthStatus !== "function" ||
    typeof desktopApi.localAuthLogout !== "function"
  ) {
    return null;
  }

  return desktopApi;
}
