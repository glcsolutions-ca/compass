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
  const flowId = process.env.EVIDENCE_FLOW_ID ?? "compass-smoke";

  const outputDir = path.join(".artifacts", "browser-evidence", headSha);
  await mkdir(outputDir, { recursive: true });

  const screenshotPath = path.join(outputDir, `${flowId}.png`);
  const manifestPath = path.join(outputDir, "manifest.json");

  const startedAt = new Date().toISOString();
  const assertions = [] as Array<{
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
    assertions.push({
      id: "heading-visible",
      description: "Landing heading is visible",
      pass: headingPass,
      details: headingPass ? `Heading: ${headingText}` : "No heading text found"
    });

    await page.getByLabel("Employee ID").fill(expectedIdentity);
    await page.getByRole("button", { name: "Load View" }).click();

    const payloadLocator = page.locator("pre").first();
    await payloadLocator.waitFor({ state: "visible", timeout: 15_000 });
    const payloadText = (await payloadLocator.textContent()) ?? "";

    const identityPass = payloadText.includes(expectedIdentity);
    assertions.push({
      id: "identity-present",
      description: "Payload contains expected identity",
      pass: identityPass,
      details: identityPass ? `Found ${expectedIdentity}` : payloadText.slice(0, 200)
    });

    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    flowStatus = "failed";
    assertions.push({
      id: "execution-error",
      description: "Playwright flow executed without runtime errors",
      pass: false,
      details: error instanceof Error ? error.message : String(error)
    });
  }

  const hasFailedAssertion = assertions.some((assertion) => !assertion.pass);
  if (hasFailedAssertion) {
    flowStatus = "failed";
  }

  const finishedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: "1",
    headSha,
    tier,
    prNumber,
    generatedAt: finishedAt,
    flows: [
      {
        id: flowId,
        entrypoint: expectedEntrypoint,
        accountIdentity: expectedIdentity,
        status: flowStatus,
        startedAt,
        finishedAt
      }
    ],
    assertions,
    artifacts: [
      {
        type: "screenshot",
        path: screenshotPath,
        createdAt: finishedAt
      }
    ]
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (flowStatus !== "passed") {
    throw new Error(`Browser evidence failed. See ${manifestPath}`);
  }
});
