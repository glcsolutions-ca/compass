import type { MetaFunction } from "react-router";
import { Link, redirect, useLoaderData, useParams } from "react-router";

export const meta: MetaFunction = () => {
  return [{ title: "Compass Tenant" }];
};

interface TenantLoaderData {
  tenantSlug: string;
  tenantName: string;
}

function readTenantName(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const tenant = (payload as { tenant?: unknown }).tenant;
  if (!tenant || typeof tenant !== "object") {
    return null;
  }

  const name = (tenant as { name?: unknown }).name;
  return typeof name === "string" && name.trim().length > 0 ? name : null;
}

export async function clientLoader({
  params,
  request
}: {
  params: { tenantSlug?: string };
  request: Request;
}): Promise<TenantLoaderData | Response> {
  const tenantSlug = params.tenantSlug?.trim();
  if (!tenantSlug) {
    return redirect("/workspaces");
  }

  const url = new URL(request.url);
  const returnTo = `${url.pathname}${url.search}`;
  const response = await fetch(
    new URL(`/v1/tenants/${encodeURIComponent(tenantSlug)}`, url).toString(),
    {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      credentials: "include",
      signal: request.signal
    }
  );

  if (response.status === 401) {
    return redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  if (response.status === 403) {
    return redirect("/workspaces?error=forbidden");
  }

  if (response.status === 404) {
    return redirect("/workspaces?error=not_found");
  }

  if (!response.ok) {
    throw new Error(`Tenant request failed with ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return {
    tenantSlug,
    tenantName: readTenantName(payload) ?? tenantSlug
  };
}

export default function TenantRoute() {
  const loaderData = useLoaderData<TenantLoaderData>();
  const params = useParams();
  const tenantSlug = params.tenantSlug ?? loaderData.tenantSlug;

  return (
    <main className="page" data-testid="tenant-page">
      <section className="panel">
        <p className="eyebrow">Compass</p>
        <h1>{loaderData.tenantName}</h1>
        <p className="helper" data-testid="tenant-slug">
          Tenant: {tenantSlug}
        </p>
        <Link className="button" to="/workspaces">
          Back to workspaces
        </Link>
      </section>
    </main>
  );
}
