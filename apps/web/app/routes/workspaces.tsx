import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";

interface WorkspaceMembership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "invited" | "disabled";
}

interface WorkspacesLoaderData {
  authenticated: boolean;
  memberships: WorkspaceMembership[];
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asMembershipArray(value: unknown): WorkspaceMembership[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const tenantId = typeof item.tenantId === "string" ? item.tenantId : null;
    const tenantSlug = typeof item.tenantSlug === "string" ? item.tenantSlug : null;
    const tenantName = typeof item.tenantName === "string" ? item.tenantName : null;
    const role =
      item.role === "owner" ||
      item.role === "admin" ||
      item.role === "member" ||
      item.role === "viewer"
        ? item.role
        : null;
    const status =
      item.status === "active" || item.status === "invited" || item.status === "disabled"
        ? item.status
        : null;

    if (!tenantId || !tenantSlug || !tenantName || !role || !status) {
      return [];
    }

    return [
      {
        tenantId,
        tenantSlug,
        tenantName,
        role,
        status
      }
    ];
  });
}

export const meta: MetaFunction = () => {
  return [{ title: "Compass Workspaces" }];
};

export async function clientLoader({
  request
}: {
  request: Request;
}): Promise<WorkspacesLoaderData> {
  try {
    const response = await fetch(new URL("/v1/auth/me", request.url).toString(), {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      credentials: "include",
      signal: request.signal
    });

    if (response.status === 401) {
      return {
        authenticated: false,
        memberships: [],
        error: null
      };
    }

    if (!response.ok) {
      throw new Error(`Auth me request failed with ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const memberships = isRecord(payload) ? asMembershipArray(payload.memberships) : [];
    const authenticated = isRecord(payload) ? payload.authenticated === true : false;

    return {
      authenticated,
      memberships,
      error: null
    };
  } catch (error) {
    return {
      authenticated: false,
      memberships: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export default function WorkspacesRoute() {
  const data = useLoaderData<WorkspacesLoaderData>();

  if (!data.authenticated) {
    return (
      <main className="page" data-testid="workspaces-unauthenticated">
        <section className="panel">
          <p className="eyebrow">Compass</p>
          <h1>Choose a workspace</h1>
          <p className="helper">Sign in to access your organizations.</p>
          <Link className="button" to="/login">
            Go to login
          </Link>
          {data.error ? <p className="helper">{data.error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="page" data-testid="workspaces-page">
      <section className="panel">
        <p className="eyebrow">Compass</p>
        <h1>Your workspaces</h1>
        {data.memberships.length === 0 ? (
          <p className="helper">
            No memberships found. Create an organization or accept an invite.
          </p>
        ) : (
          <ul className="list" data-testid="workspace-list">
            {data.memberships.map((membership) => (
              <li key={membership.tenantId}>
                <Link to={`/t/${membership.tenantSlug}`}>
                  {membership.tenantName} ({membership.role})
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
