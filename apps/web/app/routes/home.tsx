import type { MetaFunction } from "react-router";
import { useLoaderData, useNavigation } from "react-router";

interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export interface HomeLoaderData {
  apiBaseUrl: string;
  health: HealthResponse | null;
  error: string | null;
}

export interface HomeViewProps extends HomeLoaderData {
  loading: boolean;
}

const DEFAULT_API_BASE_URL = "http://localhost:3001";

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function parseHealthResponse(payload: unknown): HealthResponse {
  if (!isRecord(payload) || payload.status !== "ok" || typeof payload.timestamp !== "string") {
    throw new Error("Health response payload is invalid");
  }

  return {
    status: "ok",
    timestamp: payload.timestamp
  };
}

export function resolveApiBaseUrl(candidate: unknown): string {
  if (typeof candidate !== "string") {
    return DEFAULT_API_BASE_URL;
  }

  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return DEFAULT_API_BASE_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

export const meta: MetaFunction = () => {
  return [{ title: "Compass" }, { name: "description", content: "Compass React Router baseline" }];
};

export async function clientLoader({ request }: { request: Request }): Promise<HomeLoaderData> {
  const apiBaseUrl = resolveApiBaseUrl(
    (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL
  );
  const healthUrl = new URL("health", `${apiBaseUrl}/`);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: request.signal
    });

    if (!response.ok) {
      throw new Error(`Health request failed with ${response.status}`);
    }

    const health = parseHealthResponse(await response.json());

    return {
      apiBaseUrl,
      health,
      error: null
    };
  } catch (requestError) {
    if (isAbortError(requestError)) {
      throw requestError;
    }

    return {
      apiBaseUrl,
      health: null,
      error: formatErrorMessage(requestError)
    };
  }
}

export function HomeView({ apiBaseUrl, health, error, loading }: HomeViewProps) {
  return (
    <main className="page" data-testid="app-shell">
      <section className="panel">
        <p className="eyebrow">Compass</p>
        <h1>React Router SPA Baseline</h1>
        <p className="helper">
          Web is running in framework mode with server-side rendering disabled.
        </p>

        <dl className="list">
          <div>
            <dt>API base URL</dt>
            <dd data-testid="api-base-url">{apiBaseUrl}</dd>
          </div>
          <div>
            <dt>Health status</dt>
            <dd data-testid="api-health-status">
              {health?.status ?? (loading ? "loading" : "unavailable")}
            </dd>
          </div>
          <div>
            <dt>Health timestamp</dt>
            <dd data-testid="api-health-timestamp">{health?.timestamp ?? "n/a"}</dd>
          </div>
          <div>
            <dt>Connection error</dt>
            <dd data-testid="api-health-error">{error ?? "none"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

export default function Home() {
  const loaderData = useLoaderData<HomeLoaderData>();
  const navigation = useNavigation();

  return <HomeView {...loaderData} loading={navigation.state !== "idle"} />;
}
