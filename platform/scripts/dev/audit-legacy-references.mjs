import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();
const THIS_FILE = fileURLToPath(import.meta.url);

const FORBIDDEN_PATTERNS = [
  { pattern: "00-queue-admission.yml" },
  { pattern: "00-pr-validation.yml" },
  { pattern: "01-commit-stage.yml" },
  { pattern: "02-acceptance-stage.yml" },
  { pattern: "03-release-stage.yml" },
  { pattern: "PR Validation" },
  { pattern: "check:ci" },
  { pattern: "workflow_run:" },
  { pattern: "AZURE_GITHUB_CLIENT_ID" },
  { pattern: "infra/identity" },
  { pattern: "bootstrap/terraform" },
  { pattern: "ACR_" },
  { pattern: "az acr import" },
  { pattern: "acceptance.parameters.json" },
  { pattern: "containerapp-worker.bicep" },
  { pattern: "servicebus.bicep" },
  { pattern: "sessionpool-dynamic-sessions.bicep" },
  { pattern: "workerImage" },
  { pattern: "production-rehearsal-evidence" },
  { pattern: "apps/worker" },
  { pattern: "packages/testkit" },
  { pattern: "packages/session-agent" },
  { pattern: "packages/codex-protocol" },
  { pattern: "packages/codex-runtime-core" },
  { pattern: "/v1/agent/" },
  { pattern: "agent-types.ts" },
  { pattern: "agent-transport.ts" },
  { pattern: "agent-event-store.ts" },
  { pattern: "agent-event-normalizer.ts" },
  { pattern: "agent-client.ts" },
  { pattern: "buildDefaultAgentService" },
  { pattern: "attachAgentWebSocketGateway" },
  { pattern: "withAgentContext" },
  { pattern: "AgentRoutesContext" },
  { pattern: "AgentExecutionMode" },
  { pattern: "AgentThreadStatus" },
  { pattern: "AgentEventsResult" },
  { pattern: "AgentThreadCreateRequest" },
  { pattern: "AgentThreadCreateResponse" },
  { pattern: "AgentThreadReadResponse" },
  { pattern: "AgentThreadListQuery" },
  { pattern: "AgentThreadListResponse" },
  { pattern: "AgentThreadPatchRequest" },
  { pattern: "AgentThreadPatchResponse" },
  { pattern: "AgentThreadDeleteResponse" },
  { pattern: "AgentThreadModePatchRequest" },
  { pattern: "AgentThreadModePatchResponse" },
  { pattern: "AgentThreadRuntimeLaunchResponse" },
  { pattern: "AgentTurnStartRequest" },
  { pattern: "AgentTurnStartResponse" },
  { pattern: "AgentTurnInterruptResponse" },
  { pattern: "AgentEventsBatch" },
  { pattern: "AgentEventsList" },
  { pattern: "AgentEventSchema" },
  { pattern: "AgentStreamEventSchema" },
  { pattern: "db/migrations" },
  { pattern: "db/scripts" },
  { pattern: "db/postgres" },
  { pattern: "db/seeds" }
];

const SKIP_DIRS = new Set([
  ".git",
  ".tools",
  "node_modules",
  ".turbo",
  ".artifacts",
  "dist",
  "dist-types",
  "coverage"
]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".pnpm-store")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      yield* walk(fullPath);
      continue;
    }
    yield fullPath;
  }
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ![
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".pdf",
    ".zip",
    ".gz",
    ".woff",
    ".woff2"
  ].includes(ext);
}

async function main() {
  const hits = [];

  for await (const filePath of walk(ROOT)) {
    if (!isTextFile(filePath) || filePath === THIS_FILE) {
      continue;
    }

    const relativePath = path.relative(ROOT, filePath);
    const content = await readFile(filePath, "utf8").catch(() => "");
    if (!content) {
      continue;
    }

    for (const { pattern } of FORBIDDEN_PATTERNS) {
      if (content.includes(pattern)) {
        hits.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  if (hits.length > 0) {
    throw new Error(`Forbidden legacy references still exist:\n${hits.join("\n")}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
