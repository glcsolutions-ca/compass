import { describe, expect, it } from "vitest";
import { buildAcceptedIssuers } from "./auth.js";

describe("buildAcceptedIssuers", () => {
  it("accepts both v2 and sts issuer formats when configured with v2 issuer", () => {
    const tenantId = "98dddcec-5421-457b-8cac-aa8d27fbafb6";
    const issuers = buildAcceptedIssuers(`https://login.microsoftonline.com/${tenantId}/v2.0`);

    expect(issuers).toContain(`https://login.microsoftonline.com/${tenantId}/v2.0`);
    expect(issuers).toContain(`https://sts.windows.net/${tenantId}/`);
  });

  it("accepts both sts and v2 issuer formats when configured with sts issuer", () => {
    const tenantId = "98dddcec-5421-457b-8cac-aa8d27fbafb6";
    const issuers = buildAcceptedIssuers(`https://sts.windows.net/${tenantId}/`);

    expect(issuers).toContain(`https://sts.windows.net/${tenantId}/`);
    expect(issuers).toContain(`https://login.microsoftonline.com/${tenantId}/v2.0`);
  });

  it("keeps non-Entra issuers unchanged", () => {
    const issuer = "https://example.test/issuer";
    expect(buildAcceptedIssuers(issuer)).toEqual([issuer]);
  });
});
