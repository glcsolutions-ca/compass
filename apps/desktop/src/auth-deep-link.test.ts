import { describe, expect, it } from "vitest";
import {
  extractDeepLinkFromArgv,
  parseDesktopAuthDeepLink,
  resolveDeepLinkNavigationTarget,
  resolveDesktopAuthScheme
} from "./auth-deep-link";

describe("resolveDesktopAuthScheme", () => {
  it("defaults to reverse-domain scheme when unset or invalid", () => {
    expect(resolveDesktopAuthScheme({})).toBe("ca.glsolutions.compass");
    expect(resolveDesktopAuthScheme({ DESKTOP_AUTH_SCHEME: "123invalid" })).toBe(
      "ca.glsolutions.compass"
    );
  });

  it("normalizes valid configured values", () => {
    expect(resolveDesktopAuthScheme({ DESKTOP_AUTH_SCHEME: "Compass-App" })).toBe("compass-app");
  });
});

describe("extractDeepLinkFromArgv", () => {
  it("returns the first matching deep link argument", () => {
    const found = extractDeepLinkFromArgv([
      "electron",
      "app.js",
      "ca.glsolutions.compass://auth/callback?handoff=abc",
      "--flag"
    ]);

    expect(found).toBe("ca.glsolutions.compass://auth/callback?handoff=abc");
  });

  it("returns null when no deep link argument is present", () => {
    expect(extractDeepLinkFromArgv(["electron", "app.js", "--flag"])).toBeNull();
  });
});

describe("parseDesktopAuthDeepLink", () => {
  it("parses handoff callback links", () => {
    const parsed = parseDesktopAuthDeepLink(
      "ca.glsolutions.compass://auth/callback?handoff=token-123"
    );

    expect(parsed).toEqual({
      handoffToken: "token-123",
      nextPath: null
    });
  });

  it("parses next-path callback links", () => {
    const parsed = parseDesktopAuthDeepLink(
      "ca.glsolutions.compass://auth/callback?next=%2Flogin%3Ferror%3Dadmin_consent_required"
    );

    expect(parsed).toEqual({
      handoffToken: null,
      nextPath: "/login?error=admin_consent_required"
    });
  });

  it("rejects links with unsupported callback targets", () => {
    expect(parseDesktopAuthDeepLink("ca.glsolutions.compass://other/path?handoff=abc")).toBeNull();
    expect(
      parseDesktopAuthDeepLink("ca.glsolutions.compass://auth/callback?next=https://evil.example")
    ).toBeNull();
    expect(parseDesktopAuthDeepLink("https://example.com/callback")).toBeNull();
  });
});

describe("resolveDeepLinkNavigationTarget", () => {
  it("maps handoff links to desktop complete endpoint", () => {
    const target = resolveDeepLinkNavigationTarget({
      startUrl: "https://compass.glcsolutions.ca/chat",
      deepLink: {
        handoffToken: "handoff-xyz",
        nextPath: null
      }
    });

    expect(target).toBe(
      "https://compass.glcsolutions.ca/v1/auth/desktop/complete?handoff=handoff-xyz"
    );
  });

  it("maps next-path links to app origin", () => {
    const target = resolveDeepLinkNavigationTarget({
      startUrl: "https://compass.glcsolutions.ca/chat",
      deepLink: {
        handoffToken: null,
        nextPath: "/login?error=desktop_handoff_invalid"
      }
    });

    expect(target).toBe("https://compass.glcsolutions.ca/login?error=desktop_handoff_invalid");
  });
});
