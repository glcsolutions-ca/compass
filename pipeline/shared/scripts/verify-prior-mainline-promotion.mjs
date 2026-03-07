import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { optionalOption, parseCliArgs, requireOption } from "./cli-utils.mjs";
import { PATTERNS } from "./pipeline-contract-lib.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_LEGACY_CHECK_NAME = "Pipeline Complete";
const DEFAULT_COMMIT_STAGE_CHECK_NAME = "Commit Stage Complete";
const DEFAULT_POLL_INTERVAL_SECONDS = 10;
const DEFAULT_TIMEOUT_SECONDS = 300;

function normalizeEnv() {
  const commandEnv = { ...process.env };
  if (!commandEnv.GH_TOKEN && commandEnv.GITHUB_TOKEN) {
    commandEnv.GH_TOKEN = commandEnv.GITHUB_TOKEN;
  }
  return commandEnv;
}

function parsePositiveIntegerOption(value, { optionName, defaultValue }) {
  if (typeof value === "undefined") {
    return defaultValue;
  }

  const normalized = Number.parseInt(String(value), 10);
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new Error(`${optionName} must be an integer >= 1`);
  }
  return normalized;
}

export function parsePreviousMainlineCommit(revListLine, currentSha) {
  const normalizedCurrentSha = String(currentSha || "").trim().toLowerCase();
  if (!PATTERNS.sourceRevision.test(normalizedCurrentSha)) {
    throw new Error(`Invalid current SHA: ${currentSha}`);
  }

  const segments = String(revListLine || "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);

  if (segments.length < 2) {
    throw new Error(
      `Unable to determine the previous mainline commit for ${normalizedCurrentSha}; no first parent was found.`
    );
  }

  if (segments[0] !== normalizedCurrentSha) {
    throw new Error(
      `git rev-list returned ${segments[0]} while resolving the previous mainline commit for ${normalizedCurrentSha}.`
    );
  }

  const previousCommit = String(segments[1] || "").trim().toLowerCase();
  if (!PATTERNS.sourceRevision.test(previousCommit)) {
    throw new Error(`Invalid previous mainline commit: ${previousCommit}`);
  }

  return previousCommit;
}

function latestMatchingCheckRun(checkRuns, checkName) {
  if (!Array.isArray(checkRuns)) {
    return null;
  }

  const matches = checkRuns
    .filter((entry) => entry?.name === checkName)
    .sort((left, right) => Number(right?.id || 0) - Number(left?.id || 0));

  return matches[0] ?? null;
}

function classifyCheckRun(checkRun) {
  if (!checkRun) {
    return { status: "missing" };
  }

  if (checkRun.status !== "completed") {
    return {
      status: "pending",
      conclusion: checkRun.conclusion ?? null
    };
  }

  if (checkRun.conclusion === "success") {
    return {
      status: "success",
      conclusion: "success"
    };
  }

  return {
    status: "failure",
    conclusion: checkRun.conclusion ?? "unknown"
  };
}

export function findPromotionCheckState(checkRuns, {
  requiredCheckName,
  legacyCheckName,
  commitStageCheckName = DEFAULT_COMMIT_STAGE_CHECK_NAME
}) {
  const requiredCheck = latestMatchingCheckRun(checkRuns, requiredCheckName);
  const requiredState = classifyCheckRun(requiredCheck);
  if (requiredState.status !== "missing") {
    return {
      ...requiredState,
      matchedCheckName: requiredCheckName
    };
  }

  if (!legacyCheckName) {
    return {
      ...requiredState,
      matchedCheckName: requiredCheckName
    };
  }

  if (latestMatchingCheckRun(checkRuns, commitStageCheckName)) {
    return {
      ...requiredState,
      matchedCheckName: requiredCheckName
    };
  }

  const legacyCheck = latestMatchingCheckRun(checkRuns, legacyCheckName);
  const legacyState = classifyCheckRun(legacyCheck);
  return {
    ...legacyState,
    matchedCheckName: legacyState.status === "missing" ? requiredCheckName : legacyCheckName
  };
}

async function runGit(args, { cwd } = {}) {
  const result = await execFileAsync("git", args, {
    cwd,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  return String(result.stdout || "").trim();
}

async function loadCheckRuns(repo, commitSha) {
  const result = await execFileAsync(
    "gh",
    [
      "api",
      "-H",
      "Accept: application/vnd.github+json",
      `repos/${repo}/commits/${commitSha}/check-runs?per_page=100`
    ],
    {
      env: normalizeEnv(),
      maxBuffer: 20 * 1024 * 1024
    }
  );

  return JSON.parse(String(result.stdout || "{}")).check_runs ?? [];
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function verifyPriorMainlinePromotion(options) {
  const repo = requireOption(options, "repo");
  const currentSha = requireOption(options, "current-sha").trim().toLowerCase();
  const requiredCheckName = requireOption(options, "required-check-name");
  const legacyCheckName =
    optionalOption(options, "legacy-check-name") ?? DEFAULT_LEGACY_CHECK_NAME;
  const commitStageCheckName =
    optionalOption(options, "commit-stage-check-name") ?? DEFAULT_COMMIT_STAGE_CHECK_NAME;
  const cwd = optionalOption(options, "cwd") ?? process.cwd();
  const pollIntervalSeconds = parsePositiveIntegerOption(
    optionalOption(options, "poll-interval-seconds"),
    {
      optionName: "poll-interval-seconds",
      defaultValue: DEFAULT_POLL_INTERVAL_SECONDS
    }
  );
  const timeoutSeconds = parsePositiveIntegerOption(optionalOption(options, "timeout-seconds"), {
    optionName: "timeout-seconds",
    defaultValue: DEFAULT_TIMEOUT_SECONDS
  });

  if (!PATTERNS.sourceRevision.test(currentSha)) {
    throw new Error(`Invalid current SHA: ${currentSha}`);
  }

  const revListLine = await runGit(["rev-list", "--parents", "-n", "1", currentSha], { cwd });
  const previousCommit = parsePreviousMainlineCommit(revListLine, currentSha);
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (true) {
    const checkRuns = await loadCheckRuns(repo, previousCommit);
    const state = findPromotionCheckState(checkRuns, {
      requiredCheckName,
      legacyCheckName,
      commitStageCheckName
    });

    if (state.status === "success") {
      console.info(
        `Verified prior mainline promotion for ${previousCommit} via '${state.matchedCheckName}'.`
      );
      return {
        previousCommit,
        matchedCheckName: state.matchedCheckName
      };
    }

    if (state.status === "failure") {
      throw new Error(
        `Previous mainline commit ${previousCommit} did not pass '${state.matchedCheckName}' (conclusion=${state.conclusion}). Resolve mainline before releasing ${currentSha}.`
      );
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for prior mainline commit ${previousCommit} to pass '${requiredCheckName}'${legacyCheckName ? ` or legacy '${legacyCheckName}'` : ""}.`
      );
    }

    console.info(
      `Waiting for prior mainline promotion on ${previousCommit}. Current status: ${state.status} (${state.matchedCheckName}).`
    );
    await sleep(pollIntervalSeconds * 1000);
  }
}

export async function main(argv = process.argv.slice(2)) {
  await verifyPriorMainlinePromotion(parseCliArgs(argv));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
