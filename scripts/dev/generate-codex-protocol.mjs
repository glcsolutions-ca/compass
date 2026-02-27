import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed (${String(error.code)}): ${stderr || stdout}`
          )
        );
        return;
      }

      resolve(String(stdout || "").trim());
    });
  });
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const protocolRoot = path.resolve(rootDir, "packages/codex-protocol");
  const generatedRoot = path.resolve(protocolRoot, "generated");

  const versionOutput = await run("codex", ["--version"], rootDir);
  const normalizedVersion = versionOutput.replace(/\s+/gu, "-").trim();
  if (!normalizedVersion) {
    throw new Error("Unable to resolve codex CLI version.");
  }

  const versionDir = path.resolve(generatedRoot, normalizedVersion);
  const tsDir = path.resolve(versionDir, "ts");
  const jsonDir = path.resolve(versionDir, "json");

  await rm(versionDir, {
    recursive: true,
    force: true
  });
  await mkdir(tsDir, { recursive: true });
  await mkdir(jsonDir, { recursive: true });

  await run("codex", ["app-server", "generate-ts", "--out", tsDir], rootDir);
  await run("codex", ["app-server", "generate-json-schema", "--out", jsonDir], rootDir);

  const manifest = {
    codexCliVersion: versionOutput,
    generatedTag: normalizedVersion,
    generatedAt: new Date().toISOString(),
    commands: [
      `codex app-server generate-ts --out packages/codex-protocol/generated/${normalizedVersion}/ts`,
      `codex app-server generate-json-schema --out packages/codex-protocol/generated/${normalizedVersion}/json`
    ]
  };

  await writeFile(
    path.resolve(protocolRoot, "codex-version.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  const indexDts = `// GENERATED FILE. DO NOT EDIT.
// Regenerate with: pnpm codex:protocol:generate

export type { ServerNotification as CodexServerNotification } from "./generated/${normalizedVersion}/ts/ServerNotification";
export type { ServerRequest as CodexServerRequest } from "./generated/${normalizedVersion}/ts/ServerRequest";
export type { AuthMode as CodexAuthMode } from "./generated/${normalizedVersion}/ts/AuthMode";
export type { LoginAccountParams } from "./generated/${normalizedVersion}/ts/v2/LoginAccountParams";
export type { LoginAccountResponse } from "./generated/${normalizedVersion}/ts/v2/LoginAccountResponse";
export type { CancelLoginAccountParams } from "./generated/${normalizedVersion}/ts/v2/CancelLoginAccountParams";
export type { CancelLoginAccountResponse } from "./generated/${normalizedVersion}/ts/v2/CancelLoginAccountResponse";
export type { LogoutAccountResponse } from "./generated/${normalizedVersion}/ts/v2/LogoutAccountResponse";
export type { GetAccountParams } from "./generated/${normalizedVersion}/ts/v2/GetAccountParams";
export type { GetAccountResponse } from "./generated/${normalizedVersion}/ts/v2/GetAccountResponse";
export type { GetAccountRateLimitsResponse } from "./generated/${normalizedVersion}/ts/v2/GetAccountRateLimitsResponse";
export type { AccountUpdatedNotification } from "./generated/${normalizedVersion}/ts/v2/AccountUpdatedNotification";
export type { AccountLoginCompletedNotification } from "./generated/${normalizedVersion}/ts/v2/AccountLoginCompletedNotification";
export type { AccountRateLimitsUpdatedNotification } from "./generated/${normalizedVersion}/ts/v2/AccountRateLimitsUpdatedNotification";
export type { McpServerOauthLoginCompletedNotification } from "./generated/${normalizedVersion}/ts/v2/McpServerOauthLoginCompletedNotification";
export type { ChatgptAuthTokensRefreshParams } from "./generated/${normalizedVersion}/ts/v2/ChatgptAuthTokensRefreshParams";
export type { ChatgptAuthTokensRefreshResponse } from "./generated/${normalizedVersion}/ts/v2/ChatgptAuthTokensRefreshResponse";
export type { RateLimitSnapshot } from "./generated/${normalizedVersion}/ts/v2/RateLimitSnapshot";
export type { RateLimitWindow } from "./generated/${normalizedVersion}/ts/v2/RateLimitWindow";
`;

  await writeFile(path.resolve(protocolRoot, "index.d.ts"), indexDts, "utf8");
  await writeFile(path.resolve(protocolRoot, "index.js"), "export {};\n", "utf8");

  console.info(`codex protocol generated: ${normalizedVersion}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
