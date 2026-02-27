import { describe, expect, it } from "vitest";
import {
  isInAppAuthBootstrapUrl,
  isInAppAuthCompletionUrl,
  isInAppAuthNavigationAllowed
} from "./in-app-auth-policy";

const startUrl = "https://compass.glcsolutions.ca";
const authProviderOrigins = new Set([
  "https://login.microsoftonline.com",
  "https://login.live.com"
]);

describe("in-app auth policy", () => {
  it("recognizes Entra auth bootstrap routes on app origin", () => {
    expect(
      isInAppAuthBootstrapUrl({
        startUrl,
        rawUrl: "https://compass.glcsolutions.ca/v1/auth/entra/start?returnTo=%2F"
      })
    ).toBe(true);

    expect(
      isInAppAuthBootstrapUrl({
        startUrl,
        rawUrl: "https://compass.glcsolutions.ca/v1/auth/entra/admin-consent/start?returnTo=%2F"
      })
    ).toBe(true);

    expect(
      isInAppAuthBootstrapUrl({
        startUrl,
        rawUrl: "https://compass.glcsolutions.ca/login"
      })
    ).toBe(false);
  });

  it("allows in-app auth navigation for app and provider origins only", () => {
    expect(
      isInAppAuthNavigationAllowed({
        startUrl,
        authProviderOrigins,
        rawUrl: "https://compass.glcsolutions.ca/v1/auth/entra/start"
      })
    ).toBe(true);

    expect(
      isInAppAuthNavigationAllowed({
        startUrl,
        authProviderOrigins,
        rawUrl: "https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize"
      })
    ).toBe(true);

    expect(
      isInAppAuthNavigationAllowed({
        startUrl,
        authProviderOrigins,
        rawUrl: "https://example.com/phishing"
      })
    ).toBe(false);
  });

  it("treats non-auth app routes as auth completion targets", () => {
    expect(
      isInAppAuthCompletionUrl({
        startUrl,
        rawUrl: "https://compass.glcsolutions.ca/w/personal/chat"
      })
    ).toBe(true);

    expect(
      isInAppAuthCompletionUrl({
        startUrl,
        rawUrl: "https://compass.glcsolutions.ca/login?error=admin_consent_required"
      })
    ).toBe(true);

    expect(
      isInAppAuthCompletionUrl({
        startUrl,
        rawUrl: "https://compass.glcsolutions.ca/v1/auth/entra/callback?code=123"
      })
    ).toBe(false);
  });
});
