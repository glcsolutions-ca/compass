"use client";

import { createApiClient } from "@compass/sdk";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";

export default function HomeClient() {
  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl
      }),
    [baseUrl]
  );

  const [employeeId, setEmployeeId] = useState("employee-123");
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    payload: unknown;
  }>({ loading: false, error: null, payload: null });
  const phase = state.loading
    ? "loading"
    : state.error
      ? "error"
      : state.payload
        ? "success"
        : "idle";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ loading: true, error: null, payload: null });

    try {
      const response = await client.GET("/api/v1/employees/{employeeId}/consolidated-view", {
        params: {
          path: {
            employeeId
          }
        }
      });

      if (response.error) {
        setState({ loading: false, error: JSON.stringify(response.error), payload: null });
        return;
      }

      setState({ loading: false, error: null, payload: response.data ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ loading: false, error: `Request failed: ${message}`, payload: null });
    }
  }

  return (
    <main>
      <h1>Compass Hub</h1>
      <p className="helper">
        Compass by GLC gives clients, teams, and project managers a real-time snapshot of
        assignments, workload, time investment, and project health.
      </p>
      <form onSubmit={onSubmit}>
        <input
          data-testid="home-employee-id"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          placeholder="employee-123"
          aria-label="Employee ID"
        />
        <button data-testid="home-load-view" type="submit" disabled={state.loading}>
          {state.loading ? "Loading..." : "Load View"}
        </button>
      </form>
      <p data-testid="home-request-state" data-state={phase}>
        {phase}
      </p>
      {state.error ? <pre data-testid="home-error-json">{state.error}</pre> : null}
      {state.payload ? (
        <pre data-testid="home-payload-json">{JSON.stringify(state.payload, null, 2)}</pre>
      ) : null}
    </main>
  );
}
