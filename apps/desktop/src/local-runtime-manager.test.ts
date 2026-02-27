import { describe, expect, it } from "vitest";
import {
  LocalRuntimeManager,
  type LocalAuthState,
  type LocalAuthStore,
  type LocalCodexClient
} from "./local-runtime-manager";

function createInMemoryAuthStore(initial?: Partial<LocalAuthState>): LocalAuthStore {
  let state: LocalAuthState = {
    authenticated: false,
    mode: null,
    account: null,
    updatedAt: null,
    authUrl: null,
    ...initial
  };

  return {
    async read() {
      return state;
    },
    async write(next) {
      state = next;
    },
    async clear() {
      state = {
        authenticated: false,
        mode: null,
        account: null,
        updatedAt: null,
        authUrl: null
      };
    }
  };
}

function createFakeCodexClient(options?: { chatgptAuthenticated?: boolean }): {
  client: LocalCodexClient;
  calls: {
    interrupt: Array<{ codexThreadId: string; turnId: string }>;
  };
} {
  let authenticatedType: string | null = null;
  const calls = {
    interrupt: [] as Array<{ codexThreadId: string; turnId: string }>
  };

  const client: LocalCodexClient = {
    async readAccount() {
      return {
        type: authenticatedType,
        label: authenticatedType ? `${authenticatedType} account` : null
      };
    },
    async loginStart(input) {
      if (input.mode === "apiKey") {
        authenticatedType = "apiKey";
        return {
          authenticated: true,
          accountLabel: "API key account",
          authUrl: null
        };
      }

      if (options?.chatgptAuthenticated) {
        authenticatedType = "chatgpt";
      }

      return {
        authenticated: Boolean(options?.chatgptAuthenticated),
        accountLabel: "ChatGPT account",
        authUrl: "https://example.com/fake-chatgpt-login"
      };
    },
    async startThread() {
      return {
        codexThreadId: "codex-thread-1"
      };
    },
    async startTurn(input) {
      input.onDelta(`Local(${input.threadId}) response`);
      return {
        turnId: "codex-turn-1",
        status: "completed",
        outputText: `Local(${input.threadId}) response`
      };
    },
    async interruptTurn(input) {
      calls.interrupt.push(input);
    }
  };

  return {
    client,
    calls
  };
}

describe("LocalRuntimeManager", () => {
  it("starts local turns only after authentication and emits ordered events", async () => {
    const { client } = createFakeCodexClient();
    const manager = new LocalRuntimeManager({
      authStore: createInMemoryAuthStore(),
      codexClient: client
    });

    const events: Array<{ type: string; cursor: number }> = [];
    const unsubscribe = manager.subscribe((event) => {
      events.push({ type: event.type, cursor: event.cursor });
    });

    await expect(
      manager.startTurn({
        threadId: "thread-1",
        text: "hello"
      })
    ).rejects.toThrow("not authenticated");

    await manager.loginStart({ mode: "apiKey", apiKey: "sk-test" });

    const result = await manager.startTurn({
      threadId: "thread-1",
      turnId: "turn-1",
      text: "hello"
    });

    unsubscribe();

    expect(result.turnId).toBe("turn-1");
    expect(result.executionMode).toBe("local");
    expect(result.executionHost).toBe("desktop_local");
    expect(result.outputText).toContain("Local(thread-1) response");

    expect(events).toEqual([
      { type: "turn.started", cursor: 1 },
      { type: "item.delta", cursor: 2 },
      { type: "turn.completed", cursor: 3 }
    ]);
  });

  it("requires api key when selecting apiKey mode", async () => {
    const { client } = createFakeCodexClient();
    const manager = new LocalRuntimeManager({
      authStore: createInMemoryAuthStore(),
      codexClient: client
    });

    await expect(manager.loginStart({ mode: "apiKey" })).rejects.toThrow("API key is required");

    const state = await manager.loginStart({ mode: "apiKey", apiKey: "sk-test" });
    expect(state.authenticated).toBe(true);
    expect(state.mode).toBe("apiKey");

    const loggedOut = await manager.logout();
    expect(loggedOut.authenticated).toBe(false);
    expect(loggedOut.mode).toBeNull();
  });

  it("returns chatgpt authUrl when chatgpt login is not yet authenticated", async () => {
    const { client } = createFakeCodexClient({ chatgptAuthenticated: false });
    const manager = new LocalRuntimeManager({
      authStore: createInMemoryAuthStore(),
      codexClient: client
    });

    const state = await manager.loginStart({ mode: "chatgpt" });
    expect(state.authenticated).toBe(false);
    expect(state.authUrl).toBe("https://example.com/fake-chatgpt-login");
  });

  it("forwards interrupts to codex runtime using stored turn mapping", async () => {
    const { client, calls } = createFakeCodexClient();
    const manager = new LocalRuntimeManager({
      authStore: createInMemoryAuthStore(),
      codexClient: client
    });

    await manager.loginStart({ mode: "apiKey", apiKey: "sk-test" });
    await manager.startTurn({
      threadId: "thread-1",
      turnId: "turn-1",
      text: "hello"
    });

    await manager.interruptTurn({ turnId: "turn-1" });

    expect(calls.interrupt).toEqual([
      {
        codexThreadId: "codex-thread-1",
        turnId: "codex-turn-1"
      }
    ]);
  });
});
