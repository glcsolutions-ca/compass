import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { test, type Page } from "@playwright/test";

function parseRequiredFlowIds() {
  const requiredFlowIdsJson = process.env.REQUIRED_FLOW_IDS_JSON?.trim();
  if (requiredFlowIdsJson && requiredFlowIdsJson.length > 0) {
    const parsed = JSON.parse(requiredFlowIdsJson);
    if (!Array.isArray(parsed)) {
      throw new Error("REQUIRED_FLOW_IDS_JSON must be a JSON array");
    }

    const flowIds = parsed
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);

    if (flowIds.length === 0) {
      throw new Error("REQUIRED_FLOW_IDS_JSON must contain at least one flow ID when provided");
    }

    return flowIds;
  }

  return (process.env.EVIDENCE_FLOW_ID ?? "compass-smoke")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function runFlow(
  page: Page,
  flowId: string,
  baseUrl: string,
  requireAuthGateway: boolean,
  flowAssertions: Array<{
    id: string;
    description: string;
    pass: boolean;
    details?: string;
  }>
) {
  const headingText = (await page.locator("h1").first().textContent())?.trim() ?? "";
  flowAssertions.push({
    id: `${flowId}:heading-visible`,
    description: `[${flowId}] Landing heading is visible`,
    pass: headingText.length > 0,
    details: headingText.length > 0 ? `Heading: ${headingText}` : "No heading text found"
  });

  const signInLink = page.getByTestId("sign-in-link");
  const signInHref = (await signInLink.getAttribute("href"))?.trim() ?? "";
  flowAssertions.push({
    id: `${flowId}:sign-in-link-visible`,
    description: `[${flowId}] Sign in link is rendered`,
    pass: signInHref.length > 0,
    details: signInHref.length > 0 ? `href=${signInHref}` : "missing sign in href"
  });

  flowAssertions.push({
    id: `${flowId}:sign-in-link-target`,
    description: `[${flowId}] Sign in link targets Entra start endpoint`,
    pass: signInHref.startsWith("/v1/auth/entra/start"),
    details: signInHref.length > 0 ? `href=${signInHref}` : "missing sign in href"
  });

  if (!requireAuthGateway) {
    return;
  }

  const pingResponse = await page.request.get(`${baseUrl}/v1/ping`);
  const pingText = await pingResponse.text();
  let pingJson: { ok?: unknown } | null = null;
  try {
    pingJson = pingText.length > 0 ? (JSON.parse(pingText) as { ok?: unknown }) : null;
  } catch {
    pingJson = null;
  }

  flowAssertions.push({
    id: `${flowId}:gateway-ping-status`,
    description: `[${flowId}] Gateway /v1/ping returns 200`,
    pass: pingResponse.status() === 200,
    details: `status=${pingResponse.status()}`
  });
  flowAssertions.push({
    id: `${flowId}:gateway-ping-json`,
    description: `[${flowId}] Gateway /v1/ping returns JSON payload`,
    pass: pingJson?.ok === true,
    details: pingText.slice(0, 200)
  });

  const authStartResponse = await page.request.get(`${baseUrl}/v1/auth/entra/start?returnTo=%2F`, {
    maxRedirects: 0
  });
  const authStartStatus = authStartResponse.status();
  const authStartLocation = authStartResponse.headers().location ?? "";
  const authStartText = await authStartResponse.text();
  let authStartJson: { code?: unknown } | null = null;
  try {
    authStartJson =
      authStartText.length > 0 ? (JSON.parse(authStartText) as { code?: unknown }) : null;
  } catch {
    authStartJson = null;
  }
  const authStartIsRedirect = authStartStatus === 302 || authStartStatus === 303;
  const authStartIsEntraDisabled =
    authStartStatus === 503 &&
    (authStartJson?.code === "ENTRA_LOGIN_DISABLED" ||
      authStartJson?.code === "ENTRA_CONFIG_REQUIRED");

  flowAssertions.push({
    id: `${flowId}:gateway-auth-start-status`,
    description: `[${flowId}] Gateway auth start reaches API auth handler`,
    pass: authStartIsRedirect || authStartIsEntraDisabled,
    details: `status=${authStartStatus}, code=${String(authStartJson?.code ?? "")}`
  });
  flowAssertions.push({
    id: `${flowId}:gateway-auth-start-target`,
    description: `[${flowId}] Gateway auth start response is provider redirect or explicit Entra-disabled error`,
    pass:
      (authStartIsRedirect && authStartLocation.startsWith("https://login.microsoftonline.com/")) ||
      authStartIsEntraDisabled,
    details:
      authStartLocation ||
      `status=${authStartStatus}, code=${String(authStartJson?.code ?? "")}, body=${authStartText.slice(0, 160)}`
  });
}

test("compass smoke flow", async ({ page }) => {
  const headSha = process.env.HEAD_SHA ?? "local";
  const testedSha = process.env.TESTED_SHA ?? headSha;
  const prNumber = Number(process.env.PR_NUMBER ?? "0");
  const baseUrl = process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000";
  const expectedEntrypoint = process.env.EXPECTED_ENTRYPOINT ?? "/";
  const requireAuthGateway = process.env.REQUIRE_AUTH_GATEWAY?.trim().toLowerCase() === "true";
  const flowIds = parseRequiredFlowIds();

  const outputDir = path.join(".artifacts", "browser-evidence", testedSha);
  await mkdir(outputDir, { recursive: true });

  const manifestPath = path.join(outputDir, "manifest.json");
  const assertions: Array<{
    id: string;
    description: string;
    pass: boolean;
    details?: string;
  }> = [];
  const flows: Array<{
    id: string;
    entrypoint: string;
    accountIdentity: string;
    status: "passed" | "failed";
    startedAt: string;
    finishedAt: string;
  }> = [];
  const artifacts: Array<{
    type: string;
    path: string;
    createdAt: string;
  }> = [];

  let hasFailedFlow = false;

  for (const flowId of flowIds) {
    const screenshotPath = path.join(outputDir, `${flowId}.png`);
    const startedAt = new Date().toISOString();
    const flowAssertions: Array<{
      id: string;
      description: string;
      pass: boolean;
      details?: string;
    }> = [];
    let flowStatus: "passed" | "failed" = "passed";

    try {
      await page.goto(`${baseUrl}${expectedEntrypoint}`, { waitUntil: "networkidle" });
      await runFlow(page, flowId, baseUrl, requireAuthGateway, flowAssertions);
    } catch (error) {
      flowStatus = "failed";
      flowAssertions.push({
        id: `${flowId}:execution-error`,
        description: `[${flowId}] Playwright flow executed without runtime errors`,
        pass: false,
        details: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      artifacts.push({
        type: "screenshot",
        path: screenshotPath,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      flowAssertions.push({
        id: `${flowId}:screenshot-capture`,
        description: `[${flowId}] Screenshot capture succeeded`,
        pass: false,
        details: error instanceof Error ? error.message : String(error)
      });
    }

    if (flowAssertions.some((assertion) => !assertion.pass)) {
      flowStatus = "failed";
      hasFailedFlow = true;
    }

    flows.push({
      id: flowId,
      entrypoint: expectedEntrypoint,
      accountIdentity: "platform-baseline",
      status: flowStatus,
      startedAt,
      finishedAt: new Date().toISOString()
    });
    assertions.push(...flowAssertions);
  }

  const manifest = {
    schemaVersion: "1",
    headSha,
    testedSha,
    prNumber,
    generatedAt: new Date().toISOString(),
    flows,
    assertions,
    artifacts
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (hasFailedFlow) {
    throw new Error(`Browser evidence failed. See ${manifestPath}`);
  }
});
