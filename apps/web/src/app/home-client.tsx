"use client";

import { createApiClient } from "@compass/sdk";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";

interface HomeClientProps {
  baseUrl: string;
  defaultToken?: string;
}

export default function HomeClient({ baseUrl, defaultToken }: HomeClientProps) {
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl,
        token: defaultToken
      }),
    [baseUrl, defaultToken]
  );

  const [employeeId, setEmployeeId] = useState("employee-123");
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    payload: unknown;
  }>({ loading: false, error: null, payload: null });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ loading: true, error: null, payload: null });

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
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          placeholder="employee-123"
          aria-label="Employee ID"
        />
        <button type="submit" disabled={state.loading}>
          {state.loading ? "Loading..." : "Load View"}
        </button>
      </form>
      {state.error ? <pre>{state.error}</pre> : null}
      {state.payload ? <pre>{JSON.stringify(state.payload, null, 2)}</pre> : null}
    </main>
  );
}
