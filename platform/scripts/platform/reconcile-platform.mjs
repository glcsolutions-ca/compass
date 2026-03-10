import { pathToFileURL } from "node:url";
import { configureGithubRepo } from "../bootstrap/configure-github-repo.mjs";
import {
  assertEntraBootstrapState,
  ensureEntraApps
} from "../bootstrap/ensure-entra-apps.mjs";
import {
  appBootstrapTargetsExist,
  bootstrapProductionApps
} from "../bootstrap/bootstrap-production-apps.mjs";
import { configureWebDomain } from "../bootstrap/configure-web-domain.mjs";
import { applyPlatform } from "../infra/apply-platform.mjs";
import { loadDeliveryConfig } from "../../config/live-config.mjs";
import { ensureAzLogin, runAz } from "../../pipeline/shared/scripts/azure/az-command.mjs";

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    candidateId: "",
    resetWebClientSecret: false
  };

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--candidate-id") {
      options.candidateId = String(args.shift() || "").trim();
      continue;
    }
    if (token === "--reset-web-client-secret") {
      options.resetWebClientSecret = true;
      continue;
    }
    throw new Error(`Unknown option '${token}'`);
  }

  return options;
}

async function assertKeyVaultSecretsExist() {
  await ensureAzLogin();
  const config = await loadDeliveryConfig();
  await runAz(["account", "set", "--subscription", config.azureSubscriptionId], {
    output: "none"
  });

  for (const secretName of [
    "postgres-admin-password",
    "entra-client-secret",
    "auth-oidc-state-encryption-key"
  ]) {
    await runAz(
      [
        "keyvault",
        "secret",
        "show",
        "--vault-name",
        config.azureKeyVaultName,
        "--name",
        secretName,
        "--query",
        "id"
      ],
      { output: "tsv" }
    );
  }
}

export async function platformCheck() {
  await configureGithubRepo({ apply: false });
  await assertEntraBootstrapState();
  await assertKeyVaultSecretsExist();
  await applyPlatform({ mode: "what-if" });
}

export async function platformApply({ candidateId = "", resetWebClientSecret = false } = {}) {
  await ensureEntraApps({ resetWebClientSecret });
  await configureGithubRepo({ apply: true });
  await applyPlatform({ mode: "apply" });

  const trimmedCandidateId = String(candidateId || "").trim();
  if (trimmedCandidateId) {
    const bootstrapResult = await bootstrapProductionApps({ candidateId: trimmedCandidateId });
    await configureWebDomain();
    if (bootstrapResult.stageWebFqdn) {
      await ensureEntraApps({ stageWebFqdn: bootstrapResult.stageWebFqdn });
    }
    return bootstrapResult;
  }

  const bootstrapTargets = await appBootstrapTargetsExist();
  if (!bootstrapTargets.exists) {
    throw new Error(
      "Application resources do not exist yet. Run `pnpm platform:apply -- --candidate-id sha-<main-sha>` to bootstrap the apps from a published candidate."
    );
  }

  await configureWebDomain();
  return bootstrapTargets;
}

export async function main(argv = process.argv.slice(2)) {
  const [mode, ...rest] = argv;
  if (mode === "check") {
    await platformCheck();
    return;
  }
  if (mode === "apply") {
    const options = parseArgs(rest);
    const result = await platformApply(options);
    console.info(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error("Use 'check' or 'apply'");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
