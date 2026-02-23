import { installTestGuardrails } from "./install.mjs";

installTestGuardrails({
  mode: "commit-stage",
  allowPostgres: false,
  blockChildProcess: true
});
