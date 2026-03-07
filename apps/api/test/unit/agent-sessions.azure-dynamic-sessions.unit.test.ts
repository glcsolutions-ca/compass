import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiError } from "../../src/modules/auth/auth-service.js";
import { __internalAzureDynamicSessionsHost } from "../../src/infrastructure/runtime-hosts/azure-dynamic-sessions.js";

describe("uploadFileWithFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uploads the file with native multipart fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("uploaded", {
        status: 201
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await __internalAzureDynamicSessionsHost.uploadFileWithFetch({
      url: new URL("https://example.com/files"),
      token: "test-token",
      filename: "compass-runtime-agent.cjs",
      content: "console.log('hello');"
    });

    expect(result).toEqual({
      status: 201,
      body: "uploaded"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(calledUrl)).toBe("https://example.com/files");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      authorization: "Bearer test-token"
    });
    expect(init.body).toBeInstanceOf(FormData);

    const file = (init.body as FormData).get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("compass-runtime-agent.cjs");
    expect(await (file as File).text()).toBe("console.log('hello');");
  });

  it("maps fetch failures to a bootstrap api error", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("socket hang up")));

    await expect(
      __internalAzureDynamicSessionsHost.uploadFileWithFetch({
        url: new URL("https://example.com/files"),
        token: "test-token",
        filename: "compass-runtime-agent.cjs",
        content: "console.log('hello');"
      })
    ).rejects.toMatchObject<ApiError>({
      status: 502,
      code: "AGENT_SESSION_BOOTSTRAP_FAILED"
    });
  });
});

describe("buildManagementUrl", () => {
  it("targets the official Azure code interpreter management paths", () => {
    const uploadUrl = __internalAzureDynamicSessionsHost.buildManagementUrl({
      endpoint: "https://example.com/pool/",
      pathname: "/files",
      sessionIdentifier: "thr-123"
    });
    const executeUrl = __internalAzureDynamicSessionsHost.buildManagementUrl({
      endpoint: "https://example.com/pool/",
      pathname: "/executions",
      sessionIdentifier: "thr-123"
    });

    expect(String(uploadUrl)).toBe(
      "https://example.com/pool/files?api-version=2025-10-02-preview&identifier=thr-123"
    );
    expect(String(executeUrl)).toBe(
      "https://example.com/pool/executions?api-version=2025-10-02-preview&identifier=thr-123"
    );
  });
});

describe("buildCodeExecutionRequestBody", () => {
  it("wraps the bootstrap code using the Azure code execute request contract", () => {
    expect(
      __internalAzureDynamicSessionsHost.buildCodeExecutionRequestBody("console.log('hi')")
    ).toEqual({
      codeInputType: "inline",
      executionType: "synchronous",
      code: "console.log('hi')",
      timeoutInSeconds: 120
    });
  });
});
