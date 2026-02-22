import type { NextRequest } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";

interface RouteContext {
  params: Promise<{
    path: string[];
  }>;
}

function toUpstreamUrl(requestUrl: string, pathSegments: string[] = []) {
  const incomingUrl = new URL(requestUrl);
  const normalizedBaseUrl = API_BASE_URL.replace(/\/+$/, "");
  const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  const suffix = encodedPath.length > 0 ? `/${encodedPath}` : "";
  return `${normalizedBaseUrl}/api/v1${suffix}${incomingUrl.search}`;
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const upstreamUrl = toUpstreamUrl(request.url, path);
  const headers = new Headers(request.headers);
  headers.delete("host");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual"
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: upstreamResponse.headers
    });
  } catch (error) {
    return Response.json(
      {
        error: "Upstream API request failed",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
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
