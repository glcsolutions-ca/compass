# TDR-002: Production Container Registry Strategy (Managed Identity)

## Status

Accepted

## Date

2026-02-23

## Summary

Keep Azure Container Registry (ACR) as the only production registry for Azure Container Apps (ACA) while runtime image pulls are constrained to managed identity only. Do not switch production image storage to GitHub Container Registry (GHCR) under the current constraint.

## Context

- Production API/Web/Job workloads run on ACA and pull images using a shared user-assigned managed identity.
- Infra and deploy control plane are currently ACR-coupled for image push, digest lookup, and runtime pull auth.
- GHCR migration history in this repository showed operational drift around registry credential configuration before the move to ACR managed-identity pulls.
- Cost review objective: verify whether replacing ACR with GHCR is worth the tradeoff.

## Decision

- Keep ACR as the only production registry for ACA runtime workloads.
- Keep managed-identity-based image pulls (`AcrPull`) and do not introduce runtime registry username/password secrets.
- Keep `acrSku=Basic` as default and continue tag-retention cleanup via `.github/workflows/acr-cleanup.yml`.
- Do not add `GHCR_USERNAME`/`GHCR_PASSWORD` back to production deploy or infra workflows.
- Revisit GHCR only if one of these constraints changes:
  - runtime may use long-lived GHCR credentials (PAT), or
  - production images may be public.

## Public APIs / Interfaces / Types

- No application API changes.
- No shared package/type schema changes.
- No deploy workflow contract changes for this decision.

## Alternatives Considered

1. GHCR private images with PAT-based ACA registry credentials.
2. GHCR public images with no runtime pull secret.
3. Dual-registry operation (ACR + GHCR) with selective promotion.

All were rejected for current production posture due to security or control-plane complexity relative to expected savings.

## Cost Model Inputs

- ACR Basic registry unit: `$0.1666/day` (~`$5.07/month` at 30.4 days).
- ACR Basic storage: `$0.10/GB-month`.
- Existing in-repo cost controls already reduce ACR spend:
  - Basic SKU default in `infra/azure/environments/prod.bicepparam`.
  - scheduled tag pruning in `.github/workflows/acr-cleanup.yml`.

## Test Cases and Scenarios

1. Mainline pipeline runtime/infra stages run without GHCR production credentials configured.
2. Runtime image references remain digest-pinned and resolved through ACR.
3. ACA API/Web/Job resources continue to use managed identity pull configuration with no registry password secret references.
4. Non-prod canary prerequisite for any future GHCR reconsideration:
   - prove deploy and cold-start image pull for API/Web/Job,
   - prove migration job execution path,
   - prove no mainline promotion or determinism regression.

## Assumptions and Defaults

- Assumption: runtime image pull auth remains managed identity only.
- Assumption: production images remain private.
- Default: ACA remains the production runtime platform.
- Default: ACR Basic remains the baseline registry SKU unless changed by explicit cost/perf review.

## References

- [Azure Container Apps deploy action](https://github.com/Azure/container-apps-deploy-action)
- [Use managed identity to pull images in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull)
- [GitHub Packages billing for organizations](https://docs.github.com/en/organizations/managing-billing-for-your-products/managing-billing-for-github-packages/about-billing-for-github-packages)
- [GitHub Packages billing for personal accounts](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-packages/about-billing-for-github-packages)
- [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
- [Azure Retail Prices API query for Container Registry Basic](https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20%27Container%20Registry%27%20and%20skuName%20eq%20%27Basic%27)
