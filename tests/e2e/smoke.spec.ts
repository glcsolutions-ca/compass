import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { test, type Page } from "@playwright/test";

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

async function runBaselineFlow(
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
  const headingPass = headingText.length > 0;
  flowAssertions.push({
    id: `${flowId}:heading-visible`,
    description: `[${flowId}] Landing heading is visible`,
    pass: headingPass,
    details: headingPass ? `Heading: ${headingText}` : "No heading text found"
  });

  const helperTexts = await page.locator('[data-testid="baseline-helper-copy"]').allTextContents();
  const helperPass = helperTexts.some((value) => value.trim().length > 0);
  flowAssertions.push({
    id: `${flowId}:helper-visible`,
    description: `[${flowId}] Helper copy is visible`,
    pass: helperPass,
    details: helperPass ? "Helper copy found" : "No helper text found"
  });
}

async function runCodexFlow(
  page: Page,
  flowId: string,
  flowAssertions: Array<{
    id: string;
    description: string;
    pass: boolean;
    details?: string;
  }>
) {
  await page.getByTestId("codex-start-thread").click();
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="codex-thread-id"]');
    return element?.textContent && element.textContent !== "no-thread";
  });

  const threadText = (await page.getByTestId("codex-thread-id").textContent())?.trim() ?? "";
  flowAssertions.push({
    id: `${flowId}:thread-created`,
    description: `[${flowId}] Thread creation succeeds`,
    pass: threadText.length > 0 && threadText !== "no-thread",
    details: `threadId=${threadText || "(missing)"}`
  });

  await page.getByTestId("codex-turn-input").fill("Run a simple streamed codex turn.");
  await page.getByTestId("codex-start-turn").click();
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="codex-event-stream"]');
    return element?.textContent?.includes("turn.started");
  });

  const streamText = (await page.getByTestId("codex-event-stream").textContent()) ?? "";
  flowAssertions.push({
    id: `${flowId}:turn-streamed`,
    description: `[${flowId}] Turn emits streaming events`,
    pass: streamText.includes("turn.started"),
    details: streamText.includes("turn.started")
      ? "turn.started event observed"
      : "turn.started event not observed"
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
      if (flowId === "codex-stream") {
        await runCodexFlow(page, flowId, flowAssertions);
      } else {
        await runBaselineFlow(page, flowId, flowAssertions);
      }
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
