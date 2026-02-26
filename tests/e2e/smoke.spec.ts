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
}

test("compass smoke flow", async ({ page }) => {
  const headSha = process.env.HEAD_SHA ?? "local";
  const testedSha = process.env.TESTED_SHA ?? headSha;
  const prNumber = Number(process.env.PR_NUMBER ?? "0");
  const baseUrl = process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000";
  const expectedEntrypoint = process.env.EXPECTED_ENTRYPOINT ?? "/";
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
      await runFlow(page, flowId, flowAssertions);
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
