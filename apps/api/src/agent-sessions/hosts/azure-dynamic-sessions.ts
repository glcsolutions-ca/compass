import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { ApiError } from "../../auth-service.js";
import type {
  BootstrapSessionAgentInput,
  BootstrapSessionAgentResult,
  SessionHost
} from "../session-host.js";

const require = createRequire(import.meta.url);

const DYNAMIC_SESSIONS_API_VERSION = "2025-10-02-preview";
const WORK_DIR = "/mnt/data/compass/session-agent";
const UPLOADED_AGENT_FILE = "compass-session-agent.js";
const UPLOADED_ECHO_FILE = "compass-echo-runtime.js";
const UPLOADED_BOOTSTRAP_FILE = "compass-session-bootstrap.js";
const WS_PACKAGE_VERSION = "8.18.3";

interface AccessTokenProvider {
  getToken(): Promise<string>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readRequiredEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ApiError(503, "AGENT_RUNTIME_UNAVAILABLE", `${name} is not configured`);
  }
  return normalized;
}

class StaticAccessTokenProvider implements AccessTokenProvider {
  readonly #token: string;

  constructor(token: string) {
    this.#token = token;
  }

  async getToken(): Promise<string> {
    return this.#token;
  }
}

class ManagedIdentityAccessTokenProvider implements AccessTokenProvider {
  readonly #resource: string;
  readonly #clientId: string;
  #cachedToken: { value: string; expiresAtMs: number } | null = null;

  constructor(input: { resource: string; clientId: string }) {
    this.#resource = input.resource;
    this.#clientId = input.clientId;
  }

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.#cachedToken && this.#cachedToken.expiresAtMs > now + 60_000) {
      return this.#cachedToken.value;
    }

    const token = await this.fetchToken();
    this.#cachedToken = token;
    return token.value;
  }

  private async fetchToken(): Promise<{ value: string; expiresAtMs: number }> {
    const identityEndpoint = String(process.env.IDENTITY_ENDPOINT || "").trim();
    const identityHeader = String(process.env.IDENTITY_HEADER || "").trim();

    if (identityEndpoint && identityHeader) {
      const url = new URL(identityEndpoint);
      url.searchParams.set("api-version", "2019-08-01");
      url.searchParams.set("resource", this.#resource);
      if (this.#clientId) {
        url.searchParams.set("client_id", this.#clientId);
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-identity-header": identityHeader,
          metadata: "true"
        }
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ApiError(
          503,
          "AGENT_RUNTIME_AUTH_FAILED",
          `Managed identity token request failed (${response.status}): ${body.slice(0, 256)}`
        );
      }

      const payload = (await response.json()) as {
        access_token?: unknown;
        expires_in?: unknown;
        expires_on?: unknown;
      };
      const accessToken = readString(payload.access_token)?.trim();
      if (!accessToken) {
        throw new ApiError(
          503,
          "AGENT_RUNTIME_AUTH_FAILED",
          "Managed identity token response did not include access_token"
        );
      }

      const expiresInSeconds = Number(payload.expires_in);
      const expiresOnSeconds = Number(payload.expires_on);
      const expiresAtMs = Number.isFinite(expiresOnSeconds)
        ? expiresOnSeconds * 1000
        : Date.now() + (Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : 300_000);

      return {
        value: accessToken,
        expiresAtMs
      };
    }

    const msiEndpoint = String(process.env.MSI_ENDPOINT || "").trim();
    const msiSecret = String(process.env.MSI_SECRET || "").trim();
    if (!msiEndpoint || !msiSecret) {
      throw new ApiError(
        503,
        "AGENT_RUNTIME_AUTH_FAILED",
        "Managed identity endpoint is not configured"
      );
    }

    const url = new URL(msiEndpoint);
    url.searchParams.set("api-version", "2017-09-01");
    url.searchParams.set("resource", this.#resource);
    if (this.#clientId) {
      url.searchParams.set("clientid", this.#clientId);
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        metadata: "true",
        secret: msiSecret
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ApiError(
        503,
        "AGENT_RUNTIME_AUTH_FAILED",
        `MSI token request failed (${response.status}): ${body.slice(0, 256)}`
      );
    }

    const payload = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    const accessToken = readString(payload.access_token)?.trim();
    if (!accessToken) {
      throw new ApiError(
        503,
        "AGENT_RUNTIME_AUTH_FAILED",
        "MSI token response did not include access_token"
      );
    }

    const expiresInSeconds = Number(payload.expires_in);
    return {
      value: accessToken,
      expiresAtMs:
        Date.now() + (Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : 300_000)
    };
  }
}

function renderBootstrapScript(input: {
  template: string;
  sessionIdentifier: string;
  bootId: string;
  connectToken: string;
  controlPlaneUrl: string;
  forceRestart: boolean;
}): string {
  const replacements: Record<string, string> = {
    WORK_DIR: JSON.stringify(WORK_DIR),
    AGENT_SOURCE_FILE: JSON.stringify(`/mnt/data/${UPLOADED_AGENT_FILE}`),
    ECHO_SOURCE_FILE: JSON.stringify(`/mnt/data/${UPLOADED_ECHO_FILE}`),
    SESSION_IDENTIFIER: JSON.stringify(input.sessionIdentifier),
    BOOT_ID: JSON.stringify(input.bootId),
    CONNECT_TOKEN: JSON.stringify(input.connectToken),
    CONTROL_PLANE_URL: JSON.stringify(input.controlPlaneUrl),
    FORCE_RESTART: input.forceRestart ? "true" : "false",
    WS_VERSION: JSON.stringify(WS_PACKAGE_VERSION)
  };

  let rendered = input.template;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`__${key}__`, value);
  }
  return rendered;
}

function tryParseBootstrapOutput(stdout: string): { status: string; pid: number | null } {
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidate = lines.at(-1);
  if (!candidate) {
    return { status: "unknown", pid: null };
  }

  try {
    const payload = JSON.parse(candidate) as Record<string, unknown>;
    return {
      status: readString(payload.status) ?? "unknown",
      pid: typeof payload.pid === "number" ? payload.pid : null
    };
  } catch {
    return { status: "unknown", pid: null };
  }
}

export class AzureDynamicSessionsSessionHost implements SessionHost {
  readonly executionHost = "dynamic_sessions";
  readonly requiresPublicControlPlaneUrl = true;
  readonly #endpoint: string;
  readonly #tokenProvider: AccessTokenProvider;
  readonly #assetPaths: {
    agent: string;
    echoRuntime: string;
    bootstrapTemplate: string;
  };
  #assetCache: {
    agent: string;
    echoRuntime: string;
    bootstrapTemplate: string;
  } | null = null;

  constructor(input: { endpoint: string; tokenProvider: AccessTokenProvider }) {
    this.#endpoint = input.endpoint.replace(/\/+$/u, "");
    this.#tokenProvider = input.tokenProvider;
    this.#assetPaths = {
      agent: require.resolve("@compass/session-agent"),
      echoRuntime: require.resolve("@compass/session-agent/echo-runtime"),
      bootstrapTemplate: require.resolve("@compass/session-agent/azure-bootstrap-template")
    };
  }

  async bootstrapSessionAgent(
    input: BootstrapSessionAgentInput
  ): Promise<BootstrapSessionAgentResult> {
    const assets = await this.readAssets();
    await this.uploadFile({
      sessionIdentifier: input.sessionIdentifier,
      filename: UPLOADED_AGENT_FILE,
      content: assets.agent
    });
    await this.uploadFile({
      sessionIdentifier: input.sessionIdentifier,
      filename: UPLOADED_ECHO_FILE,
      content: assets.echoRuntime
    });

    const bootstrapSource = renderBootstrapScript({
      template: assets.bootstrapTemplate,
      sessionIdentifier: input.sessionIdentifier,
      bootId: input.bootId,
      connectToken: input.connectToken,
      controlPlaneUrl: input.controlPlaneUrl,
      forceRestart: input.forceRestart
    });
    await this.uploadFile({
      sessionIdentifier: input.sessionIdentifier,
      filename: UPLOADED_BOOTSTRAP_FILE,
      content: bootstrapSource
    });

    const result = await this.executeCode({
      sessionIdentifier: input.sessionIdentifier,
      code: bootstrapSource
    });

    return {
      status: result.status,
      pid: result.pid
    };
  }

  private async readAssets(): Promise<{
    agent: string;
    echoRuntime: string;
    bootstrapTemplate: string;
  }> {
    if (this.#assetCache) {
      return this.#assetCache;
    }

    this.#assetCache = {
      agent: await readFile(this.#assetPaths.agent, "utf8"),
      echoRuntime: await readFile(this.#assetPaths.echoRuntime, "utf8"),
      bootstrapTemplate: await readFile(this.#assetPaths.bootstrapTemplate, "utf8")
    };
    return this.#assetCache;
  }

  private async uploadFile(input: {
    sessionIdentifier: string;
    filename: string;
    content: string;
  }): Promise<void> {
    const url = this.buildUrl("/files", input.sessionIdentifier);
    const token = await this.#tokenProvider.getToken();
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "compass-session-upload-"));
    const tempFile = path.join(tempDir, input.filename);

    try {
      await writeFile(tempFile, input.content, "utf8");
      const { status, body } = await this.uploadFileWithCurl({
        url: url.toString(),
        token,
        filename: input.filename,
        tempFile
      });

      if (status >= 400) {
        throw new ApiError(
          502,
          "AGENT_SESSION_BOOTSTRAP_FAILED",
          `Azure file upload failed (${status}): ${body.slice(0, 256)}`
        );
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async uploadFileWithCurl(input: {
    url: string;
    token: string;
    filename: string;
    tempFile: string;
  }): Promise<{ status: number; body: string }> {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "curl",
        [
          "-sS",
          "-X",
          "POST",
          "-H",
          `Authorization: Bearer ${input.token}`,
          "-F",
          `file=@${input.tempFile};filename=${input.filename};type=text/javascript`,
          input.url,
          "-w",
          "\n%{http_code}"
        ],
        {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024
        },
        (error, commandStdout, commandStderr) => {
          if (error) {
            reject(
              new ApiError(
                502,
                "AGENT_SESSION_BOOTSTRAP_FAILED",
                `Azure file upload command failed: ${String(commandStderr || error.message).slice(0, 256)}`
              )
            );
            return;
          }

          resolve(commandStdout);
        }
      );
    });

    const lines = stdout.split(/\r?\n/u);
    const statusLine = lines.at(-1)?.trim() ?? "";
    const body = lines.slice(0, -1).join("\n");
    const status = Number.parseInt(statusLine, 10);
    if (!Number.isFinite(status)) {
      throw new ApiError(
        502,
        "AGENT_SESSION_BOOTSTRAP_FAILED",
        `Azure file upload returned an invalid status line: ${statusLine.slice(0, 64)}`
      );
    }

    return {
      status,
      body
    };
  }

  private async executeCode(input: {
    sessionIdentifier: string;
    code: string;
  }): Promise<{ status: string; pid: number | null }> {
    const url = this.buildUrl("/executions", input.sessionIdentifier);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.#tokenProvider.getToken()}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        codeInputType: "inline",
        executionType: "synchronous",
        timeoutInSeconds: 120,
        code: input.code
      })
    });

    const bodyText = await response.text();
    let bodyJson: Record<string, unknown> | null;
    try {
      bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      bodyJson = null;
    }

    if (!response.ok) {
      throw new ApiError(
        502,
        "AGENT_SESSION_BOOTSTRAP_FAILED",
        `Azure code execution failed (${response.status}): ${bodyText.slice(0, 256)}`
      );
    }

    const properties = asRecord(bodyJson?.properties) ?? bodyJson ?? {};
    const result = asRecord(bodyJson?.result) ?? asRecord(properties.result) ?? {};
    const status = readString(bodyJson?.status) ?? readString(properties.status) ?? "unknown";
    const stdout =
      readString(bodyJson?.stdout) ??
      readString(properties.stdout) ??
      readString(result.stdout) ??
      "";
    const stderr =
      readString(bodyJson?.stderr) ??
      readString(properties.stderr) ??
      readString(result.stderr) ??
      "";
    const succeeded = ["success", "succeeded", "completed"].includes(status.toLowerCase());
    if (!succeeded && stderr.trim()) {
      throw new ApiError(
        502,
        "AGENT_SESSION_BOOTSTRAP_FAILED",
        `Azure bootstrap execution failed: ${stderr.slice(0, 256)}`
      );
    }

    return tryParseBootstrapOutput(stdout);
  }

  private buildUrl(pathname: string, sessionIdentifier: string): URL {
    const url = new URL(`${this.#endpoint}/${pathname.replace(/^\/+/u, "")}`);
    url.searchParams.set("api-version", DYNAMIC_SESSIONS_API_VERSION);
    url.searchParams.set("identifier", sessionIdentifier);
    return url;
  }
}

export function buildDefaultAzureDynamicSessionsHost(env: NodeJS.ProcessEnv): SessionHost {
  const endpoint = readRequiredEnv(
    env.DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT,
    "DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT"
  );
  const staticBearerToken = String(env.DYNAMIC_SESSIONS_BEARER_TOKEN || "").trim();
  const tokenResource = String(
    env.DYNAMIC_SESSIONS_TOKEN_RESOURCE || "https://dynamicsessions.io"
  ).trim();
  const executorClientId = String(env.DYNAMIC_SESSIONS_EXECUTOR_CLIENT_ID || "").trim();

  const tokenProvider = staticBearerToken
    ? new StaticAccessTokenProvider(staticBearerToken)
    : new ManagedIdentityAccessTokenProvider({
        resource: tokenResource,
        clientId: executorClientId
      });

  return new AzureDynamicSessionsSessionHost({
    endpoint,
    tokenProvider
  });
}

export const __internalAzureDynamicSessionsHost = {
  renderBootstrapScript,
  tryParseBootstrapOutput
};
