import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __private__, useRuntimeAccount } from "~/components/shell/use-runtime-account";

const fetchRuntimeAccountReadMock = vi.hoisted(() => vi.fn());
const postRuntimeLoginStartMock = vi.hoisted(() => vi.fn());
const postRuntimeLoginCancelMock = vi.hoisted(() => vi.fn());
const postRuntimeLogoutMock = vi.hoisted(() => vi.fn());
const postRuntimeRateLimitsReadMock = vi.hoisted(() => vi.fn());
const subscribeRuntimeStreamMock = vi.hoisted(() => vi.fn());
const normalizeRequestErrorMock = vi.hoisted(() => vi.fn());
const readDesktopRuntimeApiMock = vi.hoisted(() => vi.fn());

vi.mock("~/components/shell/runtime-account-api", () => ({
  fetchRuntimeAccountRead: fetchRuntimeAccountReadMock,
  postRuntimeLoginStart: postRuntimeLoginStartMock,
  postRuntimeLoginCancel: postRuntimeLoginCancelMock,
  postRuntimeLogout: postRuntimeLogoutMock,
  postRuntimeRateLimitsRead: postRuntimeRateLimitsReadMock,
  subscribeRuntimeStream: subscribeRuntimeStreamMock,
  normalizeRequestError: normalizeRequestErrorMock
}));

vi.mock("~/components/shell/runtime-account-desktop-adapter", () => ({
  LOCAL_DEFAULT_STATE: {
    provider: "local_process",
    capabilities: {
      interactiveAuth: false,
      supportsChatgptManaged: false,
      supportsApiKey: false,
      supportsChatgptAuthTokens: false,
      supportsRateLimits: false,
      supportsRuntimeStream: false
    },
    authMode: null,
    requiresOpenaiAuth: false,
    account: null
  },
  readDesktopRuntimeApi: readDesktopRuntimeApiMock
}));

function runtimeState(overrides: Record<string, unknown> = {}) {
  return {
    provider: "local_process",
    capabilities: {
      interactiveAuth: true,
      supportsChatgptManaged: true,
      supportsApiKey: true,
      supportsChatgptAuthTokens: true,
      supportsRateLimits: true,
      supportsRuntimeStream: true
    },
    authMode: null,
    requiresOpenaiAuth: true,
    account: null,
    ...overrides
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  readDesktopRuntimeApiMock.mockReturnValue(null);
  fetchRuntimeAccountReadMock.mockResolvedValue(runtimeState());
  postRuntimeRateLimitsReadMock.mockResolvedValue({
    rateLimits: null,
    rateLimitsByLimitId: null
  });
  postRuntimeLoginStartMock.mockResolvedValue({
    type: "chatgpt",
    loginId: "login_1",
    authUrl: "https://auth.example.com"
  });
  postRuntimeLoginCancelMock.mockResolvedValue(undefined);
  postRuntimeLogoutMock.mockResolvedValue(undefined);
  normalizeRequestErrorMock.mockImplementation((error: unknown, fallback: string) => {
    if (error instanceof Error) {
      return {
        code: "UNKNOWN_ERROR",
        message: error.message
      };
    }
    return {
      code: "UNKNOWN_ERROR",
      message: fallback
    };
  });
  subscribeRuntimeStreamMock.mockImplementation(() => vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useRuntimeAccount", () => {
  it("runs web runtime flows for refresh, login, cancel, token auth, and disconnect", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    subscribeRuntimeStreamMock.mockImplementation(() => vi.fn());

    const { result, unmount } = renderHook(() => useRuntimeAccount());

    await waitFor(() => {
      expect(fetchRuntimeAccountReadMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.startChatgptLogin();
    });
    expect(postRuntimeLoginStartMock).toHaveBeenCalledWith({ type: "chatgpt" });
    expect(openSpy).toHaveBeenCalledWith(
      "https://auth.example.com",
      "_blank",
      "noopener,noreferrer"
    );

    await waitFor(() => {
      expect(result.current.pendingLoginId).toBe("login_1");
    });
    await act(async () => {
      await result.current.cancelLogin();
    });
    expect(postRuntimeLoginCancelMock).toHaveBeenCalledWith("login_1");

    await act(async () => {
      await result.current.startApiKeyLogin("sk-live");
    });
    expect(postRuntimeLoginStartMock).toHaveBeenCalledWith({
      type: "apiKey",
      apiKey: "sk-live"
    });

    await act(async () => {
      await result.current.startExternalTokenLogin({
        accessToken: "access-1",
        chatgptAccountId: "acct-1",
        chatgptPlanType: "plus"
      });
    });
    expect(postRuntimeLoginStartMock).toHaveBeenCalledWith({
      type: "chatgptAuthTokens",
      accessToken: "access-1",
      chatgptAccountId: "acct-1",
      chatgptPlanType: "plus"
    });

    await act(async () => {
      await result.current.disconnect();
    });
    expect(postRuntimeLogoutMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.startApiKeyLogin("   ");
    });
    expect(result.current.errorMessage).toBe("Enter an API key first.");

    unmount();
  });

  it("uses desktop runtime adapters when desktop API is available", async () => {
    const desktopApi = {
      localAuthStatus: vi.fn(async () =>
        runtimeState({
          provider: "desktop_local",
          requiresOpenaiAuth: false,
          authMode: "apikey"
        })
      ),
      localRateLimitsRead: vi.fn(async () => ({
        rateLimits: null,
        rateLimitsByLimitId: null
      })),
      localAuthStart: vi.fn(async () => ({
        authUrl: "https://desktop-auth.example.com"
      })),
      openExternal: vi.fn(async () => undefined),
      localAuthCancel: vi.fn(async () => undefined),
      localAuthLogout: vi.fn(async () => undefined),
      onRuntimeNotification: vi.fn(() => vi.fn())
    };
    readDesktopRuntimeApiMock.mockReturnValue(desktopApi);

    const { result, unmount } = renderHook(() => useRuntimeAccount());
    await waitFor(() => {
      expect(desktopApi.localAuthStatus).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.startChatgptLogin();
    });
    expect(desktopApi.localAuthStart).toHaveBeenCalledWith({ mode: "chatgpt" });
    expect(desktopApi.openExternal).toHaveBeenCalledWith("https://desktop-auth.example.com");

    await act(async () => {
      await result.current.startApiKeyLogin("desktop-key");
    });
    expect(desktopApi.localAuthStart).toHaveBeenCalledWith({
      mode: "apiKey",
      apiKey: "desktop-key"
    });

    await act(async () => {
      await result.current.disconnect();
    });
    expect(desktopApi.localAuthLogout).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("handles runtime stream notifications and refresh scheduling deterministically", async () => {
    let streamHandler: ((notification: { method: string; params?: unknown }) => void) | null = null;
    subscribeRuntimeStreamMock.mockImplementation((handler) => {
      streamHandler = handler;
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useRuntimeAccount());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.startChatgptLogin();
    });
    await waitFor(() => {
      expect(result.current.pendingLoginId).toBe("login_1");
    });

    await act(async () => {
      streamHandler?.({
        method: "account/login/completed",
        params: { loginId: "login_1", success: false, error: "Denied by runtime" }
      });
    });
    expect(result.current.errorMessage).toContain("Denied by runtime");
    expect(result.current.pendingLoginId).toBeNull();

    await act(async () => {
      streamHandler?.({
        method: "account/updated",
        params: { authMode: "apikey" }
      });
    });
    await waitFor(() => {
      expect(fetchRuntimeAccountReadMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    await act(async () => {
      streamHandler?.({
        method: "account/rateLimits/updated",
        params: {
          rateLimits: {
            limitId: "requests",
            limitName: "Requests",
            primary: { usedPercent: 10, windowDurationMins: 1, resetsAt: 123 },
            secondary: null,
            planType: "plus"
          }
        }
      });
    });
    expect(result.current.rateLimits?.rateLimitsByLimitId?.requests?.limitName).toBe("Requests");

    unmount();
  });

  it("surfaces operation-level errors for login/cancel/disconnect", async () => {
    const { result, unmount } = renderHook(() => useRuntimeAccount());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    postRuntimeLoginStartMock.mockRejectedValueOnce(new Error("chatgpt failed"));
    await act(async () => {
      await result.current.startChatgptLogin();
    });
    expect(result.current.errorMessage).toBe("chatgpt failed");

    postRuntimeLoginStartMock.mockRejectedValueOnce(new Error("api key rejected"));
    await act(async () => {
      await result.current.startApiKeyLogin("sk-invalid");
    });
    expect(result.current.errorMessage).toBe("api key rejected");

    postRuntimeLoginStartMock.mockRejectedValueOnce(new Error("token apply failed"));
    await act(async () => {
      await result.current.startExternalTokenLogin({
        accessToken: "token",
        chatgptAccountId: "acct-1",
        chatgptPlanType: "plus"
      });
    });
    expect(result.current.errorMessage).toBe("token apply failed");

    postRuntimeLoginStartMock.mockResolvedValueOnce({
      type: "chatgpt",
      loginId: "login-to-cancel",
      authUrl: null
    });
    await act(async () => {
      await result.current.startChatgptLogin();
    });

    postRuntimeLoginCancelMock.mockRejectedValueOnce(new Error("cancel failed"));
    await act(async () => {
      await result.current.cancelLogin();
    });
    expect(result.current.errorMessage).toBe("cancel failed");

    postRuntimeLogoutMock.mockRejectedValueOnce(new Error("disconnect failed"));
    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.errorMessage).toBe("disconnect failed");

    await act(async () => {
      await result.current.startExternalTokenLogin({
        accessToken: "",
        chatgptAccountId: "",
        chatgptPlanType: ""
      });
    });
    expect(result.current.errorMessage).toBe("Access token and ChatGPT account id are required.");

    act(() => {
      result.current.clearError();
    });
    expect(result.current.errorMessage).toBeNull();

    unmount();
  });
});

describe("useRuntimeAccount private helpers", () => {
  it("parses login completion notifications", () => {
    expect(__private__.readLoginCompletion({ method: "account/updated", params: {} })).toBeNull();
    expect(
      __private__.readLoginCompletion({ method: "account/login/completed", params: null })
    ).toEqual({
      loginId: null,
      success: false,
      error: "Runtime login completed with an invalid payload."
    });
    expect(
      __private__.readLoginCompletion({
        method: "account/login/completed",
        params: { loginId: "login-1", success: true, error: "" }
      })
    ).toEqual({
      loginId: "login-1",
      success: true,
      error: null
    });
  });

  it("applies rate-limit updates only when payload is valid", () => {
    const current = {
      rateLimits: null,
      rateLimitsByLimitId: null
    };
    expect(
      __private__.applyRateLimitUpdate(current, {
        method: "account/updated",
        params: {}
      })
    ).toBe(current);

    expect(
      __private__.applyRateLimitUpdate(current, {
        method: "account/rateLimits/updated",
        params: { rateLimits: { invalid: true } }
      })
    ).toBe(current);

    expect(
      __private__.applyRateLimitUpdate(current, {
        method: "account/rateLimits/updated",
        params: {
          rateLimits: {
            limitId: "requests",
            limitName: "Requests",
            primary: { usedPercent: 5, windowDurationMins: 1, resetsAt: 123 },
            secondary: null,
            planType: "plus"
          }
        }
      })
    ).toEqual({
      rateLimits: {
        limitId: "requests",
        limitName: "Requests",
        primary: { usedPercent: 5, windowDurationMins: 1, resetsAt: 123 },
        secondary: null,
        planType: "plus"
      },
      rateLimitsByLimitId: {
        requests: {
          limitId: "requests",
          limitName: "Requests",
          primary: { usedPercent: 5, windowDurationMins: 1, resetsAt: 123 },
          secondary: null,
          planType: "plus"
        }
      }
    });
  });
});
