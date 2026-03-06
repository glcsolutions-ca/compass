import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { ECHO_RUNTIME_KIND, runEchoRuntime } from "./echo-runtime.js";

export const SESSION_AGENT_HEARTBEAT_MS = 15_000;

function readRequiredEnv(env, name) {
  const value = String(env[name] ?? "").trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function readTextPayload(payload) {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }

  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString("utf8");
  }

  return Buffer.isBuffer(payload) ? payload.toString("utf8") : null;
}

export function readSessionAgentConfig(env = process.env) {
  return {
    controlPlaneUrl: readRequiredEnv(env, "COMPASS_CONTROL_PLANE_URL"),
    connectToken: readRequiredEnv(env, "COMPASS_CONNECT_TOKEN"),
    sessionIdentifier: readRequiredEnv(env, "COMPASS_SESSION_IDENTIFIER"),
    bootId: readRequiredEnv(env, "COMPASS_BOOT_ID"),
    runtimeKind: String(env.COMPASS_RUNTIME_KIND || ECHO_RUNTIME_KIND).trim() || ECHO_RUNTIME_KIND,
    heartbeatMs:
      Number.parseInt(String(env.COMPASS_HEARTBEAT_MS || ""), 10) || SESSION_AGENT_HEARTBEAT_MS
  };
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeSend(websocket, payload) {
  if (websocket.readyState !== WebSocket.OPEN) {
    return;
  }

  websocket.send(JSON.stringify(payload));
}

export async function runSessionAgent(input = {}) {
  const config = input.config ?? readSessionAgentConfig(process.env);
  const WebSocketCtor = input.WebSocketCtor ?? WebSocket;
  const now = input.now ?? (() => new Date());
  const exitProcess = input.exitProcess ?? ((code) => process.exit(code));
  const runtimeHandler = input.runtimeHandler ?? runEchoRuntime;

  return await new Promise((resolve, reject) => {
    const websocket = new WebSocketCtor(config.controlPlaneUrl, {
      headers: {
        authorization: `Bearer ${config.connectToken}`
      }
    });

    let resolved = false;
    let heartbeatTimer = null;

    const finish = (callback) => {
      if (resolved) {
        return;
      }

      resolved = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      callback();
    };

    const closeAndExit = (code) => {
      finish(() => {
        resolve({ code });
        exitProcess(code);
      });
    };

    websocket.once("open", () => {
      safeSend(websocket, {
        type: "session.hello",
        sessionIdentifier: config.sessionIdentifier,
        bootId: config.bootId,
        runtimeKind: config.runtimeKind,
        pid: process.pid,
        connectedAt: now().toISOString()
      });

      heartbeatTimer = setInterval(() => {
        safeSend(websocket, {
          type: "session.heartbeat",
          sessionIdentifier: config.sessionIdentifier,
          bootId: config.bootId,
          pid: process.pid,
          sentAt: now().toISOString()
        });
      }, config.heartbeatMs);
    });

    websocket.on("message", async (payload) => {
      const text = readTextPayload(payload);
      if (!text) {
        return;
      }

      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }

      if (!isObject(message) || typeof message.type !== "string") {
        return;
      }

      if (message.type === "session.close") {
        try {
          websocket.close(
            1000,
            typeof message.reason === "string" ? message.reason : "session-close"
          );
        } catch {
          // ignore best-effort close
        }
        return;
      }

      if (message.type === "turn.interrupt") {
        safeSend(websocket, {
          type: "turn.interrupted",
          requestId: typeof message.requestId === "string" ? message.requestId : "",
          turnId: typeof message.turnId === "string" ? message.turnId : "",
          runtime: {
            sessionIdentifier: config.sessionIdentifier,
            bootId: config.bootId,
            runtimeKind: config.runtimeKind,
            pid: process.pid
          }
        });
        return;
      }

      if (message.type !== "turn.run") {
        return;
      }

      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      const turnId = typeof message.turnId === "string" ? message.turnId : "";

      try {
        const result = await runtimeHandler({
          requestId,
          threadId: typeof message.threadId === "string" ? message.threadId : "",
          turnId,
          text: typeof message.text === "string" ? message.text : "",
          sessionIdentifier: config.sessionIdentifier,
          bootId: config.bootId,
          pid: process.pid,
          runtimeKind: config.runtimeKind
        });
        safeSend(websocket, {
          type: "turn.result",
          requestId,
          turnId,
          outputText: result.outputText,
          runtime: result.runtime
        });
      } catch (error) {
        safeSend(websocket, {
          type: "turn.error",
          requestId,
          turnId,
          code: "SESSION_AGENT_RUN_FAILED",
          message: error instanceof Error ? error.message : "Session agent run failed"
        });
      }
    });

    websocket.once("close", () => {
      closeAndExit(0);
    });

    websocket.once("error", (error) => {
      finish(() => {
        reject(error);
      });
    });
  });
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1];
if (invokedPath && currentFilePath === invokedPath) {
  await runSessionAgent();
}
