import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchRuntimeAccountRead,
  normalizeRequestError,
  postRuntimeLoginCancel,
  postRuntimeLoginStart,
  postRuntimeLogout,
  postRuntimeRateLimitsRead,
  subscribeRuntimeStream,
  type RuntimeAccountState,
  type RuntimeRateLimitsState
} from "~/components/shell/runtime-account-api";
import {
  LOCAL_DEFAULT_STATE,
  readDesktopRuntimeApi,
  type DesktopRuntimeApi
} from "~/components/shell/runtime-account-desktop-adapter";

export interface RuntimeAccountController {
  desktopApi: DesktopRuntimeApi | null;
  state: RuntimeAccountState | null;
  rateLimits: RuntimeRateLimitsState | null;
  pendingLoginId: string | null;
  busy: boolean;
  loading: boolean;
  errorMessage: string | null;
  clearError: () => void;
  refreshState: () => Promise<void>;
  startChatgptLogin: () => Promise<void>;
  startApiKeyLogin: (apiKey: string) => Promise<void>;
  startExternalTokenLogin: (input: {
    accessToken: string;
    chatgptAccountId: string;
    chatgptPlanType: string;
  }) => Promise<void>;
  cancelLogin: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useRuntimeAccount(): RuntimeAccountController {
  const desktopApi = useMemo(() => readDesktopRuntimeApi(), []);
  const [state, setState] = useState<RuntimeAccountState | null>(null);
  const [rateLimits, setRateLimits] = useState<RuntimeRateLimitsState | null>(null);
  const [pendingLoginId, setPendingLoginId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (desktopApi) {
        const desktopStatus = await desktopApi.localAuthStatus();
        setState(desktopStatus);

        if (desktopApi.localRateLimitsRead) {
          setRateLimits(await desktopApi.localRateLimitsRead());
        } else {
          setRateLimits(null);
        }
      } else {
        const nextState = await fetchRuntimeAccountRead(false);
        setState(nextState);
        if (nextState.capabilities.supportsRateLimits) {
          setRateLimits(await postRuntimeRateLimitsRead());
        } else {
          setRateLimits(null);
        }
      }
    } catch (error) {
      const normalized = normalizeRequestError(error, "Unable to load runtime account state.");
      setErrorMessage(normalized.message);
      setState(LOCAL_DEFAULT_STATE);
      setRateLimits(null);
    } finally {
      setLoading(false);
    }
  }, [desktopApi]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    if (desktopApi && typeof desktopApi.onRuntimeNotification === "function") {
      return desktopApi.onRuntimeNotification(() => {
        void refreshState();
      });
    }

    if (!state?.capabilities.supportsRuntimeStream) {
      return;
    }

    const unsubscribe = subscribeRuntimeStream(() => {
      void refreshState();
    });
    return unsubscribe;
  }, [desktopApi, refreshState, state?.capabilities.supportsRuntimeStream]);

  const startChatgptLogin = useCallback(async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      if (desktopApi) {
        const status = await desktopApi.localAuthStart({ mode: "chatgpt" });
        setPendingLoginId(null);
        if (status.authUrl && desktopApi.openExternal) {
          await desktopApi.openExternal(status.authUrl);
        }
        await refreshState();
        return;
      }

      const result = await postRuntimeLoginStart({ type: "chatgpt" });
      setPendingLoginId(result.loginId ?? null);
      if (result.authUrl) {
        window.open(result.authUrl, "_blank", "noopener,noreferrer");
      }
      await refreshState();
    } catch (error) {
      setErrorMessage(normalizeRequestError(error, "Unable to start ChatGPT login.").message);
    } finally {
      setBusy(false);
    }
  }, [desktopApi, refreshState]);

  const startApiKeyLogin = useCallback(
    async (apiKey: string) => {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        setErrorMessage("Enter an API key first.");
        return;
      }

      setBusy(true);
      setErrorMessage(null);
      try {
        if (desktopApi) {
          await desktopApi.localAuthStart({ mode: "apiKey", apiKey: trimmed });
        } else {
          await postRuntimeLoginStart({ type: "apiKey", apiKey: trimmed });
        }
        setPendingLoginId(null);
        await refreshState();
      } catch (error) {
        setErrorMessage(
          normalizeRequestError(error, "Unable to authenticate with API key.").message
        );
      } finally {
        setBusy(false);
      }
    },
    [desktopApi, refreshState]
  );

  const startExternalTokenLogin = useCallback(
    async (input: { accessToken: string; chatgptAccountId: string; chatgptPlanType: string }) => {
      const token = input.accessToken.trim();
      const accountId = input.chatgptAccountId.trim();
      if (!token || !accountId) {
        setErrorMessage("Access token and ChatGPT account id are required.");
        return;
      }

      setBusy(true);
      setErrorMessage(null);
      try {
        await postRuntimeLoginStart({
          type: "chatgptAuthTokens",
          accessToken: token,
          chatgptAccountId: accountId,
          chatgptPlanType: input.chatgptPlanType.trim() || null
        });
        setPendingLoginId(null);
        await refreshState();
      } catch (error) {
        setErrorMessage(normalizeRequestError(error, "Unable to apply external tokens.").message);
      } finally {
        setBusy(false);
      }
    },
    [refreshState]
  );

  const cancelLogin = useCallback(async () => {
    if (!pendingLoginId) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    try {
      if (desktopApi?.localAuthCancel) {
        await desktopApi.localAuthCancel({ loginId: pendingLoginId });
      } else {
        await postRuntimeLoginCancel(pendingLoginId);
      }
      setPendingLoginId(null);
      await refreshState();
    } catch (error) {
      setErrorMessage(normalizeRequestError(error, "Unable to cancel runtime login.").message);
    } finally {
      setBusy(false);
    }
  }, [desktopApi, pendingLoginId, refreshState]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      if (desktopApi) {
        await desktopApi.localAuthLogout();
      } else {
        await postRuntimeLogout();
      }
      setPendingLoginId(null);
      await refreshState();
    } catch (error) {
      setErrorMessage(
        normalizeRequestError(error, "Unable to disconnect runtime account.").message
      );
    } finally {
      setBusy(false);
    }
  }, [desktopApi, refreshState]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    desktopApi,
    state,
    rateLimits,
    pendingLoginId,
    busy,
    loading,
    errorMessage,
    clearError,
    refreshState,
    startChatgptLogin,
    startApiKeyLogin,
    startExternalTokenLogin,
    cancelLogin,
    disconnect
  };
}
