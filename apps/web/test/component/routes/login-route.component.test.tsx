import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginRoute from "~/routes/public/login/route";

const useLoaderDataMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useLoaderData: useLoaderDataMock
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  useLoaderDataMock.mockReturnValue({
    signInHref: "/v1/auth/entra/start?returnTo=%2Fchat",
    adminConsentHref: "/v1/auth/entra/admin-consent/start?returnTo=%2Fchat",
    showAdminConsentNotice: false,
    showAdminConsentSuccess: false
  });
  delete (window as { compassDesktop?: unknown }).compassDesktop;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("login route component", () => {
  it("renders default login state", () => {
    render(<LoginRoute />);

    expect(screen.getByRole("heading", { name: "Sign in with Microsoft" })).toBeTruthy();
    const signInLink = screen.getByTestId("sign-in-link");
    expect(signInLink.getAttribute("href")).toBe("/v1/auth/entra/start?returnTo=%2Fchat");
    expect(screen.queryByTestId("admin-consent-notice")).toBeNull();
    expect(screen.queryByTestId("admin-consent-success")).toBeNull();
  });

  it("renders admin consent notice/success and appends desktop client hint", () => {
    (window as { compassDesktop?: unknown }).compassDesktop = {
      isDesktop: () => true
    };
    useLoaderDataMock.mockReturnValue({
      signInHref: "/v1/auth/entra/start?returnTo=%2Fchat",
      adminConsentHref: "/v1/auth/entra/admin-consent/start?returnTo=%2Fchat",
      showAdminConsentNotice: true,
      showAdminConsentSuccess: true
    });

    render(<LoginRoute />);

    const signInLink = screen.getByTestId("sign-in-link");
    const adminConsentLink = screen.getByTestId("admin-consent-link");
    expect(signInLink.getAttribute("href")).toContain("client=desktop");
    expect(adminConsentLink.getAttribute("href")).toContain("client=desktop");
    expect(screen.getByTestId("admin-consent-notice")).toBeTruthy();
    expect(screen.getByTestId("admin-consent-success")).toBeTruthy();
  });
});
