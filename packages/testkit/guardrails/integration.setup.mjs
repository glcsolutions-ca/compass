import { installTestGuardrails } from "./install.mjs";

installTestGuardrails({
  mode: "integration",
  allowPostgres: true,
  blockChildProcess: false
});
