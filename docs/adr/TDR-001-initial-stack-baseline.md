# TDR-001: Initial Technology Stack Baseline (Compass Hub)

## Status

Accepted

## Date

2026-02-21

## Summary

Select a TypeScript-first, Azure-optimized, API-first stack that delivers a backend API and Next.js web app now, while minimizing rework for future browser extension and desktop clients.

## Context

- Product shape: backend API + frontend web app in v1.
- Expected future clients: browser extension and desktop app.
- Requirements context: consolidated employee read view, no cross-system write behavior in v1, freshness/completeness target around 1 minute.
- Team preference chosen: TypeScript-first.
- Hosting preference chosen: Azure-optimized.
- Web runtime preference chosen: Next.js app.

## Decision

- Use a TypeScript monorepo with `pnpm` workspaces and `turborepo`.
- Backend API: `Node.js` + `TypeScript` + `Fastify`.
- API style: REST JSON with `OpenAPI 3.1` as the source of truth.
- Contract/runtime validation: `zod` schemas mapped to OpenAPI.
- Data store: Azure Database for PostgreSQL (canonical consolidated read model).
- Async processing: Azure Service Bus + dedicated worker service for ingestion/sync/retry.
- Web app: `Next.js` (React) as the primary frontend.
- Auth: Microsoft Entra ID (OIDC/OAuth2 JWT bearer for API and web).
- Observability: OpenTelemetry instrumentation to Azure Monitor/Application Insights.
- Deployment: containerized services on Azure Container Apps (API, workers, Next.js server workload).

## Public APIs / Interfaces / Types

- Versioned API base path: `/api/v1`.
- OpenAPI document published from backend and committed in-repo.
- Shared packages:
  - `@compass/contracts`: API request/response schemas and domain DTOs.
  - `@compass/sdk`: generated typed client from OpenAPI.
- API compatibility policy:
  - Additive fields are backward-compatible.
  - Breaking changes require `/api/v2` or explicit migration window.

## Alternatives Considered

1. .NET-first stack (`ASP.NET Core` + C# + Azure-native tooling).
2. Python-first stack (`FastAPI` + Celery).
3. Vite SPA for web v1.
4. GraphQL-first API.

## Test Cases and Scenarios

1. Contract correctness via generated OpenAPI and SDK checks.
2. API compatibility tests for `/api/v1` response stability.
3. Sync reliability tests for idempotency/retry/dead-letter behavior.
4. Freshness SLO test for source update visibility within 60 seconds.
5. Multi-client reuse checks via shared SDK consumption across frontend surfaces.
6. Auth-path test validating JWT bearer enforcement.

## Assumptions and Defaults

- Assumption: v1 is read/consolidation only (no write-back to source systems).
- Assumption: Azure tenancy and Entra ID are available.
- Default: REST/OpenAPI is mandatory for all new endpoints.
- Default: New client surfaces consume the shared SDK, not bespoke API wrappers.
- Default: Prefer portability-safe implementation choices that still run on Azure managed services.
