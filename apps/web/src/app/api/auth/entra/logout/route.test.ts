import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { SSO_COOKIE_NAME } from "../../../../auth/sso-cookie";

describe("entra logout route", () => {
  it("clears sso cookie and redirects to login", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/entra/logout", {
      method: "POST"
    });

    const response = await POST(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/login");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SSO_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
  });
});
