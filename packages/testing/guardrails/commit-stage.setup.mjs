import { installTestGuardrails } from "./install.mjs";
import { loadRuntimeModePolicy } from "./policy.mjs";

installTestGuardrails(loadRuntimeModePolicy("commitStage"));
