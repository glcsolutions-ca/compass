import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { test } from "@playwright/test";

test("compass smoke flow", async ({ page }) => {
  const headSha = process.env.HEAD_SHA ?? "local";
  const tier = process.env.RISK_TIER ?? "t2";
  const prNumber = Number(process.env.PR_NUMBER ?? "0");
  const baseUrl = process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000";
  const expectedEntrypoint = process.env.EXPECTED_ENTRYPOINT ?? "/";
  const expectedIdentity = process.env.EXPECTED_ACCOUNT_IDENTITY ?? "employee-123";
  const flowIds = (process.env.EVIDENCE_FLOW_ID ?? "compass-smoke")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const outputDir = path.join(".artifacts", "browser-evidence", headSha);
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

      await page.getByLabel("Employee ID").fill(expectedIdentity);
      await page.getByRole("button", { name: "Load View" }).click();

      const payloadLocator = page.locator("pre").first();
      await payloadLocator.waitFor({ state: "visible", timeout: 15_000 });
      const payloadText = (await payloadLocator.textContent()) ?? "";

      const identityPass = payloadText.includes(expectedIdentity);
      flowAssertions.push({
        id: `${flowId}:identity-present`,
        description: `[${flowId}] Payload contains expected identity`,
        pass: identityPass,
        details: identityPass ? `Found ${expectedIdentity}` : payloadText.slice(0, 200)
      });

      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (error) {
      flowStatus = "failed";
      flowAssertions.push({
        id: `${flowId}:execution-error`,
        description: `[${flowId}] Playwright flow executed without runtime errors`,
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
      accountIdentity: expectedIdentity,
      status: flowStatus,
      startedAt,
      finishedAt
    });

    artifacts.push({
      type: "screenshot",
      path: screenshotPath,
      createdAt: finishedAt
    });

    assertions.push(...flowAssertions);
  }

  const manifest = {
    schemaVersion: "1",
    headSha,
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
