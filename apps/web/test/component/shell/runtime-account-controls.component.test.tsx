import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeAccountControls } from "~/components/shell/runtime-account-controls";

const useRuntimeAccountMock = vi.hoisted(() => vi.fn());

vi.mock("~/components/shell/use-runtime-account", () => ({
  useRuntimeAccount: useRuntimeAccountMock
}));

function buildRuntimeAccountModel(
  overrides: Record<string, unknown> = {}
): ReturnType<typeof useRuntimeAccountMock> {
  return {
    desktopApi: null,
    state: {
      provider: "local_process",
      capabilities: {
        interactiveAuth: true,
        supportsChatgptManaged: true,
        supportsApiKey: true,
        supportsChatgptAuthTokens: true,
        supportsRateLimits: true,
        supportsRuntimeStream: true
      },
      authMode: "chatgpt",
      requiresOpenaiAuth: true,
      account: {
        type: "chatgpt",
        label: "runtime@example.com"
      }
    },
    rateLimits: null,
    pendingLoginId: null,
    busy: false,
    loading: false,
    errorMessage: null,
    clearError: vi.fn(),
    refreshState: vi.fn(async () => undefined),
    startChatgptLogin: vi.fn(async () => undefined),
    startApiKeyLogin: vi.fn(async () => undefined),
    startExternalTokenLogin: vi.fn(async () => undefined),
    cancelLogin: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    ...overrides
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("runtime account controls", () => {
  it("renders controls and invokes runtime actions", () => {
    const runtimeAccount = buildRuntimeAccountModel();
    useRuntimeAccountMock.mockReturnValue(runtimeAccount);

    render(<RuntimeAccountControls />);

    expect(screen.getByText("Runtime account")).toBeTruthy();
    expect(screen.getByText(/Connected as runtime@example\.com/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Connect ChatGPT/i }));
    expect(runtimeAccount.startChatgptLogin).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Disconnect/i }));
    expect(runtimeAccount.disconnect).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    expect(runtimeAccount.refreshState).toHaveBeenCalledTimes(1);

    const apiKeyInput = screen.getByLabelText("API key");
    fireEvent.change(apiKeyInput, {
      target: {
        value: "sk-test"
      }
    });
    expect(runtimeAccount.clearError).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Use API key/i }));
    expect(runtimeAccount.startApiKeyLogin).toHaveBeenCalledWith("sk-test");

    fireEvent.change(screen.getByPlaceholderText("Access token"), {
      target: { value: "access-token" }
    });
    fireEvent.change(screen.getByPlaceholderText("ChatGPT account id"), {
      target: { value: "acct-1" }
    });
    fireEvent.change(screen.getByPlaceholderText("Plan type (optional)"), {
      target: { value: "plus" }
    });

    fireEvent.click(screen.getByRole("button", { name: /Apply external tokens/i }));
    expect(runtimeAccount.startExternalTokenLogin).toHaveBeenCalledWith({
      accessToken: "access-token",
      chatgptAccountId: "acct-1",
      chatgptPlanType: "plus"
    });
  });

  it("shows provider-managed, pending login, error, and rate-limit sections", () => {
    const runtimeAccount = buildRuntimeAccountModel({
      state: {
        provider: "dynamic_sessions",
        capabilities: {
          interactiveAuth: true,
          supportsChatgptManaged: true,
          supportsApiKey: false,
          supportsChatgptAuthTokens: false,
          supportsRateLimits: true,
          supportsRuntimeStream: true
        },
        authMode: null,
        requiresOpenaiAuth: false,
        account: null
      },
      pendingLoginId: "login_1",
      errorMessage: "Unable to authenticate runtime account.",
      rateLimits: {
        rateLimits: null,
        rateLimitsByLimitId: {
          codex: {
            limitId: "codex",
            limitName: "Codex",
            primary: {
              usedPercent: 42,
              windowDurationMins: 15,
              resetsAt: 1_730_947_200
            },
            secondary: null
          }
        }
      }
    });
    useRuntimeAccountMock.mockReturnValue(runtimeAccount);

    render(<RuntimeAccountControls />);

    expect(screen.getByText(/Provider-managed runtime/)).toBeTruthy();
    expect(screen.getByText(/Runtime credentials are managed/)).toBeTruthy();
    expect(screen.getByText(/ChatGPT login is in progress/)).toBeTruthy();
    expect(screen.getByText(/Unable to authenticate runtime account/)).toBeTruthy();
    expect(screen.getByText("Rate limits")).toBeTruthy();
    expect(screen.getByText("Codex")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(runtimeAccount.cancelLogin).toHaveBeenCalledTimes(1);

    const apiKeyButtons = screen.getAllByRole("button", { name: /Use API key/i });
    expect(apiKeyButtons.every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Apply external tokens/i })).toBeNull();
  });
});
