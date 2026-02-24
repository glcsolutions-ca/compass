import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearSsoCookieHeader } from "../../../../auth/sso-cookie";

export async function POST(request: NextRequest) {
  const redirectUrl = new URL("/login", request.url);
  const response = NextResponse.redirect(redirectUrl);
  response.headers.append("set-cookie", clearSsoCookieHeader());
  return response;
}
