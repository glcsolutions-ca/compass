import createClient, { type Client } from "openapi-fetch";
import type { ApiPaths } from "./index.js";

export type ApiClient = Client<ApiPaths>;

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export function createApiClient({ baseUrl, fetch: customFetch }: ApiClientOptions): ApiClient {
  return createClient<ApiPaths>({
    baseUrl,
    fetch: customFetch
  });
}

export async function getHealth(client: ApiClient) {
  const result = await client.GET("/health");

  if (!result.data) {
    throw new Error("Health request returned no payload");
  }

  return result.data;
}

export async function getPing(client: ApiClient) {
  const result = await client.GET("/v1/ping");

  if (!result.data) {
    throw new Error("Ping request returned no payload");
  }

  return result.data;
}
