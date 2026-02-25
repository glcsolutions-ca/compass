import { describe, expect, it } from "vitest";
import {
  createLoginPageModel,
  normalizeNextPath,
  resolveLoginErrorMessage
} from "./login-page.model";

describe("login page model", () => {
  it("normalizes unsafe next paths to root", () => {
    expect(normalizeNextPath(null)).toBe("/");
    expect(normalizeNextPath("https://evil.test")).toBe("/");
    expect(normalizeNextPath("//evil.test")).toBe("/");
  });

  it("keeps valid in-app next paths", () => {
    expect(normalizeNextPath("/")).toBe("/");
    expect(normalizeNextPath("/workspace")).toBe("/workspace");
  });

  it("maps known error codes to actionable copy", () => {
    expect(resolveLoginErrorMessage("tenant_not_allowed")).toBe(
      "Your Microsoft Entra tenant is not approved for access."
    );
    expect(resolveLoginErrorMessage("state_mismatch")).toBe(
      "Your sign-in session expired. Start sign-in again."
    );
  });

  it("creates a model from query params", () => {
    const model = createLoginPageModel({
      next: ["/settings"],
      error: "provider_error"
    });

    expect(model).toEqual({
      nextPath: "/settings",
      errorCode: "provider_error",
      errorMessage: "Microsoft sign-in was canceled or denied."
    });
  });
});
