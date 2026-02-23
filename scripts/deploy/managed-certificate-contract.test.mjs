import { describe, expect, it } from "vitest";
import {
  evaluateManagedCertificateContract,
  extractManagedCertificateEntries
} from "./managed-certificate-contract.mjs";

describe("extractManagedCertificateEntries", () => {
  it("extracts name and subjectName from Azure CLI payload", () => {
    const entries = extractManagedCertificateEntries([
      {
        name: "mc-api-compass-glcsolutions-ca",
        id: "/subscriptions/xxx/resourceGroups/rg/providers/Microsoft.App/managedEnvironments/env/managedCertificates/mc-api-compass-glcsolutions-ca",
        properties: {
          subjectName: "api.compass.glcsolutions.ca"
        }
      }
    ]);

    expect(entries).toEqual([
      {
        name: "mc-api-compass-glcsolutions-ca",
        subjectName: "api.compass.glcsolutions.ca",
        id: "/subscriptions/xxx/resourceGroups/rg/providers/Microsoft.App/managedEnvironments/env/managedCertificates/mc-api-compass-glcsolutions-ca"
      }
    ]);
  });
});

describe("evaluateManagedCertificateContract", () => {
  const certificateEntries = [
    {
      name: "mc-api-compass-glcsolutions-ca",
      subjectName: "api.compass.glcsolutions.ca",
      id: "api-id"
    },
    {
      name: "mc-web-compass-glcsolutions-ca",
      subjectName: "compass.glcsolutions.ca",
      id: "web-id"
    }
  ];

  it("passes when domain and certificate are both unset", () => {
    const result = evaluateManagedCertificateContract({
      scopeLabel: "API",
      customDomain: "",
      customDomainEnvVar: "ACA_API_CUSTOM_DOMAIN",
      managedCertificateName: "",
      managedCertificateEnvVar: "ACA_API_MANAGED_CERTIFICATE_NAME",
      managedCertificates: certificateEntries
    });

    expect(result).toEqual({
      scopeLabel: "API",
      customDomain: "",
      managedCertificateName: "",
      mode: "disabled"
    });
  });

  it("fails when domain is set but certificate name is missing", () => {
    expect(() =>
      evaluateManagedCertificateContract({
        scopeLabel: "API",
        customDomain: "api.compass.glcsolutions.ca",
        customDomainEnvVar: "ACA_API_CUSTOM_DOMAIN",
        managedCertificateName: "",
        managedCertificateEnvVar: "ACA_API_MANAGED_CERTIFICATE_NAME",
        managedCertificates: certificateEntries
      })
    ).toThrow("ACA_API_MANAGED_CERTIFICATE_NAME is required");
  });

  it("passes when certificate exists and matches domain", () => {
    const result = evaluateManagedCertificateContract({
      scopeLabel: "API",
      customDomain: "api.compass.glcsolutions.ca",
      customDomainEnvVar: "ACA_API_CUSTOM_DOMAIN",
      managedCertificateName: "mc-api-compass-glcsolutions-ca",
      managedCertificateEnvVar: "ACA_API_MANAGED_CERTIFICATE_NAME",
      managedCertificates: certificateEntries
    });

    expect(result).toEqual({
      scopeLabel: "API",
      customDomain: "api.compass.glcsolutions.ca",
      managedCertificateName: "mc-api-compass-glcsolutions-ca",
      mode: "existing"
    });
  });

  it("fails when certificate exists but subject does not match", () => {
    expect(() =>
      evaluateManagedCertificateContract({
        scopeLabel: "WEB",
        customDomain: "compass.glcsolutions.ca",
        customDomainEnvVar: "ACA_WEB_CUSTOM_DOMAIN",
        managedCertificateName: "mc-api-compass-glcsolutions-ca",
        managedCertificateEnvVar: "ACA_WEB_MANAGED_CERTIFICATE_NAME",
        managedCertificates: certificateEntries
      })
    ).toThrow("does not match");
  });

  it("fails when certificate name is missing but domain already has an existing certificate", () => {
    expect(() =>
      evaluateManagedCertificateContract({
        scopeLabel: "WEB",
        customDomain: "compass.glcsolutions.ca",
        customDomainEnvVar: "ACA_WEB_CUSTOM_DOMAIN",
        managedCertificateName: "web-prod-cert-v2",
        managedCertificateEnvVar: "ACA_WEB_MANAGED_CERTIFICATE_NAME",
        managedCertificates: certificateEntries
      })
    ).toThrow("already has managed certificate");
  });

  it("allows create path when certificate name is unused and subject has no existing certificate", () => {
    const result = evaluateManagedCertificateContract({
      scopeLabel: "API",
      customDomain: "new-api.compass.glcsolutions.ca",
      customDomainEnvVar: "ACA_API_CUSTOM_DOMAIN",
      managedCertificateName: "mc-api-new-compass-glcsolutions-ca",
      managedCertificateEnvVar: "ACA_API_MANAGED_CERTIFICATE_NAME",
      managedCertificates: certificateEntries
    });

    expect(result).toEqual({
      scopeLabel: "API",
      customDomain: "new-api.compass.glcsolutions.ca",
      managedCertificateName: "mc-api-new-compass-glcsolutions-ca",
      mode: "create"
    });
  });
});
