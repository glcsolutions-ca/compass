import { request as httpsRequest } from "node:https";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { ApiError } from "../../modules/auth/auth-service.js";
import type {
  BootstrapSessionAgentInput,
  BootstrapSessionAgentResult,
  SessionHost
} from "../../modules/runtime/session-host.js";

const require = createRequire(import.meta.url);

const DYNAMIC_SESSIONS_API_VERSION = "2025-10-02-preview";
const WORK_DIR = "/mnt/data/compass/runtime-agent";
const UPLOADED_AGENT_FILE = "compass-runtime-agent.cjs";
const UPLOADED_BOOTSTRAP_FILE = "compass-session-bootstrap.js";

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
    SESSION_IDENTIFIER: JSON.stringify(input.sessionIdentifier),
    BOOT_ID: JSON.stringify(input.bootId),
    CONNECT_TOKEN: JSON.stringify(input.connectToken),
    CONTROL_PLANE_URL: JSON.stringify(input.controlPlaneUrl),
    FORCE_RESTART: input.forceRestart ? "true" : "false"
  };

  let rendered = input.template;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`__${key}__`, value);
  }
  return rendered;
}

function buildManagementUrl(input: {
  endpoint: string;
  pathname: string;
  sessionIdentifier: string;
}): URL {
  const url = new URL(
    `${input.endpoint.replace(/\/+$/u, "")}/${input.pathname.replace(/^\/+/u, "")}`
  );
  url.searchParams.set("api-version", DYNAMIC_SESSIONS_API_VERSION);
  url.searchParams.set("identifier", input.sessionIdentifier);
  return url;
}

function buildCodeExecutionRequestBody(code: string): Record<string, unknown> {
  return {
    codeInputType: "inline",
    executionType: "synchronous",
    code,
    timeoutInSeconds: 120
  };
}

async function postJsonWithHttps(input: {
  url: URL;
  token: string;
  body: Record<string, unknown>;
}): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(input.body);

  return await new Promise((resolve, reject) => {
    const request = httpsRequest(
      input.url,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.token}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload)
        }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body
          });
        });
      }
    );

    request.on("error", (error) => {
      reject(error);
    });

    request.write(payload);
    request.end();
  });
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

async function uploadFileWithFetch(input: {
  url: URL;
  token: string;
  filename: string;
  content: string;
}): Promise<{ status: number; body: string }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([input.content], {
      type: "text/javascript"
    }),
    input.filename
  );

  let response: Response;
  try {
    response = await fetch(input.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.token}`
      },
      body: form
    });
  } catch (error) {
    throw new ApiError(
      502,
      "AGENT_SESSION_BOOTSTRAP_FAILED",
      `Azure file upload request failed: ${error instanceof Error ? error.message : String(error).slice(0, 256)}`
    );
  }

  return {
    status: response.status,
    body: await response.text()
  };
}

export class AzureDynamicSessionsSessionHost implements SessionHost {
  readonly executionHost = "dynamic_sessions";
  readonly requiresPublicControlPlaneUrl = true;
  readonly #endpoint: string;
  readonly #tokenProvider: AccessTokenProvider;
  readonly #assetPaths: {
    agentBundle: string;
    bootstrapTemplate: string;
  };
  #assetCache: {
    agentBundle: string;
    bootstrapTemplate: string;
  } | null = null;

  constructor(input: { endpoint: string; tokenProvider: AccessTokenProvider }) {
    this.#endpoint = input.endpoint.replace(/\/+$/u, "");
    this.#tokenProvider = input.tokenProvider;
    this.#assetPaths = {
      agentBundle: require.resolve("@compass/runtime-agent/azure-agent-bundle"),
      bootstrapTemplate: require.resolve("@compass/runtime-agent/azure-bootstrap-template")
    };
  }

  async bootstrapSessionAgent(
    input: BootstrapSessionAgentInput
  ): Promise<BootstrapSessionAgentResult> {
    const assets = await this.readAssets();
    await this.uploadFile({
      sessionIdentifier: input.sessionIdentifier,
      filename: UPLOADED_AGENT_FILE,
      content: assets.agentBundle
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
    agentBundle: string;
    bootstrapTemplate: string;
  }> {
    if (this.#assetCache) {
      return this.#assetCache;
    }

    this.#assetCache = {
      agentBundle: await readFile(this.#assetPaths.agentBundle, "utf8"),
      bootstrapTemplate: await readFile(this.#assetPaths.bootstrapTemplate, "utf8")
    };
    return this.#assetCache;
  }

  private async uploadFile(input: {
    sessionIdentifier: string;
    filename: string;
    content: string;
  }): Promise<void> {
    const url = buildManagementUrl({
      endpoint: this.#endpoint,
      pathname: "/files",
      sessionIdentifier: input.sessionIdentifier
    });
    const token = await this.#tokenProvider.getToken();
    const { status, body } = await uploadFileWithFetch({
      url,
      token,
      filename: input.filename,
      content: input.content
    });

    if (status >= 400) {
      throw new ApiError(
        502,
        "AGENT_SESSION_BOOTSTRAP_FAILED",
        `Azure file upload failed (${status}): ${body.slice(0, 256)}`
      );
    }
  }

  private async executeCode(input: {
    sessionIdentifier: string;
    code: string;
  }): Promise<{ status: string; pid: number | null }> {
    const url = buildManagementUrl({
      endpoint: this.#endpoint,
      pathname: "/executions",
      sessionIdentifier: input.sessionIdentifier
    });
    const response = await postJsonWithHttps({
      url,
      token: await this.#tokenProvider.getToken(),
      body: buildCodeExecutionRequestBody(input.code)
    });

    const bodyText = response.body;
    let bodyJson: Record<string, unknown> | null;
    try {
      bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      bodyJson = null;
    }

    if (response.status >= 400) {
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
  uploadFileWithFetch,
  renderBootstrapScript,
  tryParseBootstrapOutput,
  buildManagementUrl,
  buildCodeExecutionRequestBody
};
