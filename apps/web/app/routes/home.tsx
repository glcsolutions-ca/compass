import { useEffect, useMemo, useState } from "react";
import type { MetaFunction } from "react-router";

interface HealthResponse {
  status: string;
  timestamp: string;
}

const DEFAULT_API_BASE_URL = "http://localhost:3001";

export const meta: MetaFunction = () => {
  return [{ title: "Compass" }, { name: "description", content: "Compass React Router baseline" }];
};

export default function Home() {
  const apiBaseUrl = useMemo(() => {
    const candidate = (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL;
    const baseUrl =
      typeof candidate === "string" && candidate.length > 0 ? candidate : DEFAULT_API_BASE_URL;
    return baseUrl.replace(/\/$/, "");
  }, []);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${apiBaseUrl}/health`, {
          method: "GET",
          headers: {
            accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`Health request failed with ${response.status}`);
        }

        const payload = (await response.json()) as HealthResponse;
        if (active) {
          setHealth(payload);
        }
      } catch (requestError) {
        if (active) {
          setHealth(null);
          setError(requestError instanceof Error ? requestError.message : String(requestError));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

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
