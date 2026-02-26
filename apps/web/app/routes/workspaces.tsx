import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useState, type FormEvent } from "react";

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
  const [createSlug, setCreateSlug] = useState("");
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [inviteSlug, setInviteSlug] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  async function submitCreateOrganization(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (createBusy) {
      return;
    }

    const slug = createSlug.trim().toLowerCase();
    const name = createName.trim();
    if (!slug || !name) {
      setCreateError("Organization slug and name are required.");
      return;
    }

    setCreateError(null);
    setCreateBusy(true);
    try {
      const response = await fetch("/v1/tenants", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          slug,
          name
        })
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: unknown;
        tenant?: { slug?: unknown };
      } | null;

      if (!response.ok) {
        const message =
          typeof payload?.message === "string" ? payload.message : "Unable to create organization";
        setCreateError(message);
        return;
      }

      const tenantSlug =
        typeof payload?.tenant?.slug === "string" && payload.tenant.slug.trim().length > 0
          ? payload.tenant.slug.trim()
          : slug;
      window.location.assign(`/t/${tenantSlug}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreateBusy(false);
    }
  }

  async function submitInviteAcceptance(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (inviteBusy) {
      return;
    }

    const tenantSlug = inviteSlug.trim();
    const token = inviteToken.trim();
    if (!tenantSlug || !token) {
      setInviteError("Tenant slug and invite token are required.");
      return;
    }

    setInviteError(null);
    setInviteBusy(true);
    try {
      const response = await fetch(
        `/v1/tenants/${encodeURIComponent(tenantSlug)}/invites/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: {
            accept: "application/json"
          },
          credentials: "include"
        }
      );

      const payload = (await response.json().catch(() => null)) as {
        message?: unknown;
        tenantSlug?: unknown;
      } | null;

      if (!response.ok) {
        const message =
          typeof payload?.message === "string" ? payload.message : "Unable to accept invite";
        setInviteError(message);
        return;
      }

      const resolvedSlug =
        typeof payload?.tenantSlug === "string" && payload.tenantSlug.trim().length > 0
          ? payload.tenantSlug.trim()
          : tenantSlug;
      window.location.assign(`/t/${resolvedSlug}`);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : String(error));
    } finally {
      setInviteBusy(false);
    }
  }

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
          <>
            <p className="helper">
              No memberships found. Create an organization or accept an invite.
            </p>
            <form
              className="list"
              data-testid="create-organization-form"
              onSubmit={submitCreateOrganization}
            >
              <label>
                Organization slug
                <input
                  name="slug"
                  value={createSlug}
                  onChange={(event) => setCreateSlug(event.target.value)}
                  placeholder="acme"
                  autoComplete="off"
                />
              </label>
              <label>
                Organization name
                <input
                  name="name"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="Acme Corp"
                  autoComplete="organization"
                />
              </label>
              <button className="button" type="submit" disabled={createBusy}>
                {createBusy ? "Creating..." : "Create organization"}
              </button>
              {createError ? <p className="helper">{createError}</p> : null}
            </form>
            <form
              className="list"
              data-testid="accept-invite-form"
              onSubmit={submitInviteAcceptance}
            >
              <label>
                Tenant slug
                <input
                  name="tenantSlug"
                  value={inviteSlug}
                  onChange={(event) => setInviteSlug(event.target.value)}
                  placeholder="acme"
                  autoComplete="off"
                />
              </label>
              <label>
                Invite token
                <input
                  name="inviteToken"
                  value={inviteToken}
                  onChange={(event) => setInviteToken(event.target.value)}
                  placeholder="Paste invite token"
                  autoComplete="off"
                />
              </label>
              <button className="button secondary" type="submit" disabled={inviteBusy}>
                {inviteBusy ? "Joining..." : "Have an invite?"}
              </button>
              {inviteError ? <p className="helper">{inviteError}</p> : null}
            </form>
          </>
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
