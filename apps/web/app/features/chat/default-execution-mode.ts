import type { AgentExecutionMode } from "~/features/chat/agent-types";

function readRawDefaultExecutionMode(): string {
  const viteValue =
    typeof import.meta !== "undefined" && import.meta.env
      ? String(import.meta.env.VITE_AGENT_DEFAULT_EXECUTION_MODE ?? "")
      : "";
  if (viteValue.trim()) {
    return viteValue;
  }

  if (typeof process !== "undefined" && process.env) {
    return String(process.env.AGENT_DEFAULT_EXECUTION_MODE ?? "");
  }

  return "";
}

export function readDefaultExecutionMode(): AgentExecutionMode {
  return readRawDefaultExecutionMode().trim().toLowerCase() === "local" ? "local" : "cloud";
}
