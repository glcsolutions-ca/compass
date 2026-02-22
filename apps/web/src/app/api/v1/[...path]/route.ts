import type { NextRequest } from "next/server";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const UPSTREAM_TIMEOUT_MS = 10_000;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "traceparent",
  "tracestate",
  "baggage",
  "x-correlation-id",
  "x-request-id"
]);

interface RouteContext {
  params: Promise<{
    path: string[];
  }>;
}

function getApiBaseUrl() {
  return (process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

function toUpstreamUrl(requestUrl: string, pathSegments: string[] = []) {
  const incomingUrl = new URL(requestUrl);
  const normalizedBaseUrl = getApiBaseUrl();
  const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  const suffix = encodedPath.length > 0 ? `/${encodedPath}` : "";
  return `${normalizedBaseUrl}/api/v1${suffix}${incomingUrl.search}`;
}

function buildUpstreamRequestHeaders(requestHeaders: Headers) {
  const headers = new Headers();

  for (const [name, value] of requestHeaders.entries()) {
    const normalizedName = name.toLowerCase();
    if (!FORWARDED_REQUEST_HEADERS.has(normalizedName)) {
      continue;
    }
    if (HOP_BY_HOP_HEADERS.has(normalizedName)) {
      continue;
    }
    headers.set(name, value);
  }

  return headers;
}

function buildDownstreamResponseHeaders(upstreamHeaders: Headers) {
  const headers = new Headers();

  for (const [name, value] of upstreamHeaders.entries()) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    headers.set(name, value);
  }

  return headers;
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstreamUrl = toUpstreamUrl(request.url, path);
  const headers = buildUpstreamRequestHeaders(request.headers);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store"
    });

    const responseHeaders = buildDownstreamResponseHeaders(upstreamResponse.headers);
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders
    });
  } catch {
    return Response.json(
      {
        error: "Upstream API request failed",
        code: "UPSTREAM_UNAVAILABLE"
      },
      {
        status: 502,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}
