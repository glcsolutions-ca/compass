import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { test } from "@playwright/test";

function parseRequiredFlowIds() {
  const requiredFlowIdsJson = process.env.REQUIRED_FLOW_IDS_JSON?.trim();
  if (requiredFlowIdsJson && requiredFlowIdsJson.length > 0) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(requiredFlowIdsJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`REQUIRED_FLOW_IDS_JSON must be valid JSON: ${message}`);
    }

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

test("compass smoke flow", async ({ page }) => {
  const headSha = process.env.HEAD_SHA ?? "local";
  const testedSha = process.env.TESTED_SHA ?? headSha;
  const tier = process.env.RISK_TIER ?? "standard";
  const prNumber = Number(process.env.PR_NUMBER ?? "0");
  const baseUrl = process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000";
  const expectedEntrypoint = process.env.EXPECTED_ENTRYPOINT ?? "/";
  const baselineLabel = "platform-baseline";
  const flowIds = parseRequiredFlowIds();

  const outputDir = path.join(".artifacts", "browser-evidence", testedSha);
  await mkdir(outputDir, { recursive: true });

  const manifestPath = path.join(outputDir, "manifest.json");

  const assertions = [] as Array<{
    id: string;
    description: string;
    pass: boolean;
    details?: string;
  }>;
  const flows = [] as Array<{
    id: string;
    entrypoint: string;
    accountIdentity: string;
    status: "passed" | "failed";
    startedAt: string;
    finishedAt: string;
  }>;
  const artifacts = [] as Array<{
    type: string;
    path: string;
    createdAt: string;
  }>;

  let hasFailedFlow = false;

  for (const flowId of flowIds) {
    const screenshotPath = path.join(outputDir, `${flowId}.png`);
    const startedAt = new Date().toISOString();
    const flowAssertions = [] as Array<{
      id: string;
      description: string;
      pass: boolean;
      details?: string;
    }>;
    let flowStatus: "passed" | "failed" = "passed";

    try {
      await page.goto(`${baseUrl}${expectedEntrypoint}`, { waitUntil: "networkidle" });

      const headingText = (await page.locator("h1").first().textContent())?.trim() ?? "";
      const headingPass = headingText.length > 0;
      flowAssertions.push({
        id: `${flowId}:heading-visible`,
        description: `[${flowId}] Landing heading is visible`,
        pass: headingPass,
        details: headingPass ? `Heading: ${headingText}` : "No heading text found"
      });

      const helperText = await page.locator(".helper").allTextContents();
      const helperPass = helperText.some((value) =>
        value.toLowerCase().includes("foundation baseline is active")
      );
      flowAssertions.push({
        id: `${flowId}:baseline-copy-visible`,
        description: `[${flowId}] Foundation baseline copy is visible`,
        pass: helperPass,
        details: helperPass ? "Baseline copy found" : helperText.join(" | ")
      });
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

    const hasFailedAssertion = flowAssertions.some((assertion) => !assertion.pass);
    if (hasFailedAssertion) {
      flowStatus = "failed";
    }

    if (flowStatus === "failed") {
      hasFailedFlow = true;
    }

    const finishedAt = new Date().toISOString();
    flows.push({
      id: flowId,
      entrypoint: expectedEntrypoint,
      accountIdentity: baselineLabel,
      status: flowStatus,
      startedAt,
      finishedAt
    });

    assertions.push(...flowAssertions);
  }

  const manifest = {
    schemaVersion: "1",
    headSha,
    testedSha,
    tier,
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
