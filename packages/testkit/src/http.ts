export interface FetchJsonResponseFixture {
  status?: number;
  body?: unknown;
  headers?: HeadersInit;
}

export interface FetchJsonFixture {
  fetch: typeof globalThis.fetch;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
}

function normalizeInput(input: URL | RequestInfo) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  throw new Error(`Unsupported fetch input type: ${typeof input}`);
}

function buildJsonResponse({
  status = 200,
  body = {},
  headers = {}
}: FetchJsonResponseFixture = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });
}

export function createFetchJsonFixture(
  fixtures: Record<string, FetchJsonResponseFixture>,
  fallbackFixture: FetchJsonResponseFixture = { status: 404, body: { code: "not_found" } }
): FetchJsonFixture {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];

  const fetchFixture: typeof globalThis.fetch = async (
    input: URL | RequestInfo,
    init?: RequestInit
  ) => {
    const url = normalizeInput(input);
    calls.push({ url, init });

    const entry = fixtures[url] ?? fixtures[new URL(url).pathname] ?? fallbackFixture;

    return buildJsonResponse(entry);
  };

  return {
    fetch: fetchFixture,
    calls
  };
}
