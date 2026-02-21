import createClient from "openapi-fetch";
import type { ApiPaths } from "./index.js";

export type ApiClient = ReturnType<typeof createApiClient>;

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
}

export function createApiClient({ baseUrl, token }: ApiClientOptions) {
  return createClient<ApiPaths>({
    baseUrl,
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined
  });
}
