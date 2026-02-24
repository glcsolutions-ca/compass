import { describe, expect, it } from "vitest";
import {
  assertExternalOpenAllowed,
  isNavigationAllowed,
  parseOriginAllowlist,
  toHttpOrigin
} from "./navigation-policy";

describe("navigation policy", () => {
  it("normalizes HTTP/S URLs to origin", () => {
    expect(toHttpOrigin("https://example.com/path?foo=bar")).toBe("https://example.com");
    expect(toHttpOrigin("http://localhost:3000/test")).toBe("http://localhost:3000");
  });

  it("rejects unsupported navigation protocols", () => {
    expect(() => toHttpOrigin("mailto:support@example.com")).toThrow(
      "Unsupported navigation protocol"
    );
  });

  it("allows only configured origins for in-app navigation", () => {
    const allowedOrigins = parseOriginAllowlist([
      "https://app.example.com",
      "https://docs.example.com/path"
    ]);

    expect(isNavigationAllowed("https://app.example.com/home", allowedOrigins)).toBe(true);
    expect(isNavigationAllowed("https://docs.example.com/reference", allowedOrigins)).toBe(true);
    expect(isNavigationAllowed("https://evil.example.com", allowedOrigins)).toBe(false);
  });

  it("allows only HTTPS and mailto for external open", () => {
    expect(assertExternalOpenAllowed("https://example.com").toString()).toBe(
      "https://example.com/"
    );
    expect(assertExternalOpenAllowed("mailto:support@example.com").toString()).toBe(
      "mailto:support@example.com"
    );
    expect(() => assertExternalOpenAllowed("http://example.com")).toThrow(
      "Unsupported external URL protocol"
    );
  });
});
