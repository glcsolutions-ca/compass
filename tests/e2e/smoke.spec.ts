import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { test, type Page } from "@playwright/test";

const CHAT_LAYOUT_WIDTHS = [1280, 1440, 1728] as const;
const CHAT_LAYOUT_TARGET_DELTA_PX = 4;
const CHAT_LAYOUT_MIN_WIDTH_PX = 832;
const CHAT_LAYOUT_MAX_WIDTH_PX = 932;
type SmokeChatSendMode = "required" | "disabled" | "auto";

function readErrorCode(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseJsonObject<T>(input: string): T | null {
  if (input.length === 0) {
    return null;
  }

  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function centerX(box: { x: number; width: number }): number {
  return box.x + box.width / 2;
}

async function ensureSidebarState(
  page: Page,
  targetState: "expanded" | "collapsed"
): Promise<boolean> {
  const collapseButton = page.getByRole("button", { name: "Collapse sidebar" }).first();
  const expandButton = page.getByRole("button", { name: "Expand sidebar" }).first();
  const collapseVisible = await collapseButton.isVisible().catch(() => false);
  const expandVisible = await expandButton.isVisible().catch(() => false);

  if (targetState === "collapsed") {
    if (collapseVisible) {
      await collapseButton.click();
      await page.waitForTimeout(220);
      return true;
    }

    return expandVisible;
  }

  if (expandVisible) {
    await expandButton.click();
    await page.waitForTimeout(220);
    return true;
  }

  return collapseVisible;
}

async function measureChatCenterDeltas(page: Page): Promise<{
  viewportDelta: number;
  composerDelta: number;
  contentCenter: number;
  viewportCenter: number;
  composerCenter: number;
  viewportWidth: number;
  composerWidth: number;
} | null> {
  const mainBox = await page.getByTestId("app-main").first().boundingBox();
  const viewportBox = await page.locator(".aui-thread-viewport").first().boundingBox();
  const composerBox = await page.locator(".aui-composer-root").first().boundingBox();
  if (!mainBox || !viewportBox || !composerBox) {
    return null;
  }

  const contentCenter = centerX(mainBox);
  const viewportCenter = centerX(viewportBox);
  const composerCenter = centerX(composerBox);

  return {
    viewportDelta: Math.abs(viewportCenter - contentCenter),
    composerDelta: Math.abs(composerCenter - contentCenter),
    contentCenter,
    viewportCenter,
    composerCenter,
    viewportWidth: viewportBox.width,
    composerWidth: composerBox.width
  };
}

async function captureChatLayoutBaselines({
  page,
  baseUrl,
  flowId,
  stage,
  outputDir,
  flowAssertions,
  artifacts
}: {
  page: Page;
  baseUrl: string;
  flowId: string;
  stage: "empty" | "populated";
  outputDir: string;
  flowAssertions: Array<{
    id: string;
    description: string;
    pass: boolean;
    details?: string;
  }>;
  artifacts: Array<{
    type: string;
    path: string;
    createdAt: string;
  }>;
}) {
  await page.goto(`${baseUrl}/chat`, { waitUntil: "networkidle" });

  for (const width of CHAT_LAYOUT_WIDTHS) {
    await page.setViewportSize({
      width,
      height: 900
    });

    for (const sidebarState of ["expanded", "collapsed"] as const) {
      const stateApplied = await ensureSidebarState(page, sidebarState);
      flowAssertions.push({
        id: `${flowId}:chat-layout-state-${stage}-${width.toString()}-${sidebarState}`,
        description: `[${flowId}] Chat layout can toggle sidebar to ${sidebarState} at ${width.toString()}px (${stage})`,
        pass: stateApplied
      });

      const measurements = await measureChatCenterDeltas(page);
      const centered =
        measurements !== null &&
        measurements.viewportDelta <= CHAT_LAYOUT_TARGET_DELTA_PX &&
        measurements.composerDelta <= CHAT_LAYOUT_TARGET_DELTA_PX;

      flowAssertions.push({
        id: `${flowId}:chat-layout-center-${stage}-${width.toString()}-${sidebarState}`,
        description: `[${flowId}] Timeline and composer stay centered (<=${CHAT_LAYOUT_TARGET_DELTA_PX.toString()}px) at ${width.toString()}px with sidebar ${sidebarState} (${stage})`,
        pass: centered,
        details:
          measurements === null
            ? "Unable to measure chat layout bounding boxes."
            : `viewportDelta=${measurements.viewportDelta.toFixed(2)}, composerDelta=${measurements.composerDelta.toFixed(2)}, contentCenter=${measurements.contentCenter.toFixed(2)}`
      });

      const widthInRange =
        measurements !== null &&
        measurements.viewportWidth >= CHAT_LAYOUT_MIN_WIDTH_PX &&
        measurements.viewportWidth <= CHAT_LAYOUT_MAX_WIDTH_PX &&
        measurements.composerWidth >= CHAT_LAYOUT_MIN_WIDTH_PX &&
        measurements.composerWidth <= CHAT_LAYOUT_MAX_WIDTH_PX;

      flowAssertions.push({
        id: `${flowId}:chat-layout-width-${stage}-${width.toString()}-${sidebarState}`,
        description: `[${flowId}] Timeline and composer use balanced desktop width (${CHAT_LAYOUT_MIN_WIDTH_PX}-${CHAT_LAYOUT_MAX_WIDTH_PX}px) at ${width.toString()}px with sidebar ${sidebarState} (${stage})`,
        pass: widthInRange,
        details:
          measurements === null
            ? "Unable to measure chat layout bounding boxes."
            : `viewportWidth=${measurements.viewportWidth.toFixed(2)}, composerWidth=${measurements.composerWidth.toFixed(2)}`
      });

      const screenshotPath = path.join(
        outputDir,
        `${flowId}-chat-${stage}-${sidebarState}-${width.toString()}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });
      artifacts.push({
        type: "screenshot",
        path: screenshotPath,
        createdAt: new Date().toISOString()
      });
    }
  }
}

function parseRequiredFlowIds() {
  const requiredFlowIdsJson = process.env.REQUIRED_FLOW_IDS_JSON?.trim();
  if (requiredFlowIdsJson && requiredFlowIdsJson.length > 0) {
    const parsed = parseJsonObject<unknown>(requiredFlowIdsJson);
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

function parseSmokeChatSendMode(rawValue: string | undefined): SmokeChatSendMode {
  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === "true" || normalized === "required") {
    return "required";
  }

  if (normalized === "false" || normalized === "disabled") {
    return "disabled";
  }

  return "auto";
}

async function waitForApiGateway(page: Page, baseUrl: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastDetails = "unreachable";

  while (Date.now() < deadline) {
    try {
      const response = await page.request.get(`${baseUrl}/v1/ping`, {
        timeout: 2_500
      });
      const body = await response.text();
      const payload = parseJsonObject<{ ok?: unknown }>(body);

      if (response.status() === 200 && payload?.ok === true) {
        return;
      }

      lastDetails = `status=${response.status()}, body=${body.slice(0, 120)}`;
    } catch (error) {
      lastDetails = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    `API gateway did not become ready at ${baseUrl}/v1/ping within ${timeoutMs.toString()}ms (${lastDetails})`
  );
}

async function runFlow(
  page: Page,
  flowId: string,
  baseUrl: string,
  requireAuthGateway: boolean,
  smokeChatSendMode: SmokeChatSendMode,
  smokeChatLayout: boolean,
  outputDir: string,
  flowAssertions: Array<{
    id: string;
    description: string;
    pass: boolean;
    details?: string;
  }>,
  artifacts: Array<{
    type: string;
    path: string;
    createdAt: string;
  }>
) {
  const requiresChatSurface = smokeChatSendMode !== "disabled" || smokeChatLayout;

  if (!requiresChatSurface) {
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

  if (!requireAuthGateway && !requiresChatSurface) {
    return;
  }

  if (requiresChatSurface) {
    const pageErrors: string[] = [];
    const onPageError = (error: Error) => {
      pageErrors.push(error.message);
    };

    page.on("pageerror", onPageError);
    try {
      await page.goto(`${baseUrl}/chat`, { waitUntil: "networkidle" });

      const composerInput = page.getByPlaceholder("Ask Compass anything...").last();
      const sendButton = page.getByLabel("Send prompt").last();
      let composerVisible = await composerInput.isVisible().catch(() => false);
      let sendVisible = await sendButton.isVisible().catch(() => false);

      const shouldAttemptSignInNavigation = requireAuthGateway || smokeChatSendMode === "required";

      if (
        (!composerVisible || !sendVisible) &&
        smokeChatSendMode !== "disabled" &&
        shouldAttemptSignInNavigation
      ) {
        const signInLink = page.getByTestId("sign-in-link").first();
        const signInVisible = await signInLink.isVisible().catch(() => false);
        if (signInVisible) {
          await signInLink.click();
          await page.waitForLoadState("networkidle");
          composerVisible = await composerInput.isVisible().catch(() => false);
          sendVisible = await sendButton.isVisible().catch(() => false);
        }
      }

      const chatSurfaceAvailable = composerVisible && sendVisible;
      const requireChatSurface = smokeChatLayout || smokeChatSendMode === "required";

      flowAssertions.push({
        id: `${flowId}:chat-composer-visible`,
        description: `[${flowId}] Chat composer is visible`,
        pass: requireChatSurface ? chatSurfaceAvailable : true,
        details: `available=${chatSurfaceAvailable.toString()}, required=${requireChatSurface.toString()}`
      });

      if (smokeChatLayout && chatSurfaceAvailable) {
        await captureChatLayoutBaselines({
          page,
          baseUrl,
          flowId,
          stage: "empty",
          outputDir,
          flowAssertions,
          artifacts
        });
      }

      const shouldSendSmoke = smokeChatSendMode !== "disabled" && chatSurfaceAvailable;
      if (shouldSendSmoke) {
        await page.goto(`${baseUrl}/chat`, { waitUntil: "networkidle" });
        await composerInput.fill("Smoke test prompt");
        await sendButton.click();
        await page.waitForTimeout(1200);

        const sentPromptVisible = await page
          .getByText("Smoke test prompt")
          .last()
          .isVisible()
          .catch(() => false);
        flowAssertions.push({
          id: `${flowId}:chat-send-renders-user-prompt`,
          description: `[${flowId}] Chat send renders the user prompt in the timeline`,
          pass: sentPromptVisible
        });

        const applicationErrorVisible = await page
          .getByText("Application Error", { exact: true })
          .first()
          .isVisible()
          .catch(() => false);
        flowAssertions.push({
          id: `${flowId}:chat-send-no-application-error-overlay`,
          description: `[${flowId}] Chat send does not trigger the application error overlay`,
          pass: !applicationErrorVisible
        });
      }

      if (smokeChatLayout && chatSurfaceAvailable) {
        await captureChatLayoutBaselines({
          page,
          baseUrl,
          flowId,
          stage: "populated",
          outputDir,
          flowAssertions,
          artifacts
        });
      }

      const lookupErrors = pageErrors.filter((message) => message.includes("tapClientLookup"));
      if (shouldSendSmoke) {
        flowAssertions.push({
          id: `${flowId}:chat-no-runtime-index-errors`,
          description: `[${flowId}] Chat send interaction does not trigger runtime index errors`,
          pass: lookupErrors.length === 0,
          details: lookupErrors.length > 0 ? lookupErrors.join(" | ") : undefined
        });
      }

      if (!chatSurfaceAvailable && smokeChatSendMode === "auto" && !smokeChatLayout) {
        const signInLink = page.getByTestId("sign-in-link").first();
        const signInVisible = await signInLink.isVisible().catch(() => false);
        flowAssertions.push({
          id: `${flowId}:chat-auto-mode-sign-in-visible`,
          description: `[${flowId}] Auto chat smoke mode falls back to visible sign-in launcher when composer is unavailable`,
          pass: signInVisible
        });
      }
    } finally {
      page.off("pageerror", onPageError);
    }
  }

  if (!requireAuthGateway) {
    return;
  }

  const pingResponse = await page.request.get(`${baseUrl}/v1/ping`);
  const pingText = await pingResponse.text();
  const pingJson = parseJsonObject<{ ok?: unknown }>(pingText);

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
  const authStartJson = parseJsonObject<{ code?: unknown }>(authStartText);
  const authStartCode = readErrorCode(authStartJson?.code);
  const authStartIsRedirect = authStartStatus === 302 || authStartStatus === 303;
  const authStartIsExplicitAuthUnavailable =
    authStartStatus === 503 &&
    (authStartCode === "ENTRA_LOGIN_DISABLED" ||
      authStartCode === "ENTRA_CONFIG_REQUIRED" ||
      authStartCode === "AUTH_NOT_CONFIGURED");

  flowAssertions.push({
    id: `${flowId}:gateway-auth-start-status`,
    description: `[${flowId}] Gateway auth start reaches API auth handler`,
    pass: authStartIsRedirect || authStartIsExplicitAuthUnavailable,
    details: `status=${authStartStatus}, code=${authStartCode}`
  });
  flowAssertions.push({
    id: `${flowId}:gateway-auth-start-target`,
    description: `[${flowId}] Gateway auth start response is provider redirect or explicit auth-unavailable error`,
    pass:
      (authStartIsRedirect && authStartLocation.startsWith("https://login.microsoftonline.com/")) ||
      authStartIsExplicitAuthUnavailable,
    details:
      authStartLocation ||
      `status=${authStartStatus}, code=${authStartCode}, body=${authStartText.slice(0, 160)}`
  });
}

test("compass smoke flow", async ({ page }) => {
  const headSha = process.env.HEAD_SHA ?? "local";
  const testedSha = process.env.TESTED_SHA ?? headSha;
  const prNumber = Number(process.env.PR_NUMBER ?? "0");
  const baseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3000";
  const expectedEntrypoint = process.env.EXPECTED_ENTRYPOINT ?? "/";
  const requireAuthGateway = process.env.REQUIRE_AUTH_GATEWAY?.trim().toLowerCase() === "true";
  const smokeChatSendMode = parseSmokeChatSendMode(process.env.SMOKE_CHAT_SEND);
  const smokeChatLayout = process.env.SMOKE_CHAT_LAYOUT?.trim().toLowerCase() === "true";
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

  await waitForApiGateway(page, baseUrl);

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
      await runFlow(
        page,
        flowId,
        baseUrl,
        requireAuthGateway,
        smokeChatSendMode,
        smokeChatLayout,
        outputDir,
        flowAssertions,
        artifacts
      );
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
