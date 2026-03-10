import { pathToFileURL } from "node:url";
import { appendFile } from "node:fs/promises";
import { parseCliArgs, requireOption, optionalOption } from "./cli-utils.mjs";

async function githubApi(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

function toTime(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "unknown";
  }

  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function parseBudgetMinutes(value) {
  if (typeof value === "undefined") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed * 60_000;
}

function summarizeJobs(jobs, prefix) {
  const stageJobs = jobs.filter((job) => String(job.name || "").startsWith(prefix));
  if (stageJobs.length === 0) {
    return null;
  }

  const starts = stageJobs.map((job) => toTime(job.started_at)).filter(Boolean);
  const ends = stageJobs
    .map((job) => toTime(job.completed_at) ?? Date.now())
    .filter(Boolean);
  const earliest = Math.min(...starts);
  const latest = Math.max(...ends);
  const failures = stageJobs
    .filter((job) => job.conclusion && job.conclusion !== "success")
    .map((job) => `${job.name} (${job.conclusion})`);

  return {
    label: prefix.replace(/\s*\/\s*$/u, ""),
    earliest,
    latest,
    durationMs: latest - earliest,
    failures
  };
}

function evaluateBudget(label, actualDurationMs, budgetDurationMs) {
  if (!Number.isFinite(actualDurationMs) || !Number.isFinite(budgetDurationMs)) {
    return null;
  }

  return {
    label,
    actualDurationMs,
    budgetDurationMs,
    exceeded: actualDurationMs > budgetDurationMs
  };
}

export function buildTimingSummary({
  jobs,
  headline,
  lineStop = false,
  now = Date.now(),
  budgets = {}
}) {
  const commit = summarizeJobs(jobs, "Commit Stage");
  const acceptance = summarizeJobs(jobs, "Acceptance Stage");
  const release = summarizeJobs(jobs, "Release Stage");
  const started = jobs.map((job) => toTime(job.started_at)).filter(Boolean);
  const completed = jobs
    .map((job) => toTime(job.completed_at) ?? now)
    .filter(Boolean);
  const totalDuration =
    started.length > 0 && completed.length > 0
      ? Math.max(...completed) - Math.min(...started)
      : null;

  const budgetEvaluations = [
    evaluateBudget("Total lead time", totalDuration, budgets.totalLeadTimeMs),
    evaluateBudget("Commit Stage", commit?.durationMs, budgets.commitStageMs),
    evaluateBudget("Acceptance Stage", acceptance?.durationMs, budgets.acceptanceStageMs),
    evaluateBudget("Release Stage", release?.durationMs, budgets.releaseStageMs)
  ].filter(Boolean);

  const sections = [
    `## ${headline}`,
    `- Total lead time: ${formatDuration(totalDuration ?? Number.NaN)}`,
    `- Commit Stage: ${commit ? formatDuration(commit.durationMs) : "not available"}`,
    `- Acceptance Stage: ${acceptance ? formatDuration(acceptance.durationMs) : "not available"}`,
    `- Release Stage: ${release ? formatDuration(release.durationMs) : "not available"}`
  ];

  if (budgetEvaluations.length > 0) {
    sections.push("- Budget check:");
    for (const budget of budgetEvaluations) {
      sections.push(
        `  - ${budget.label}: ${formatDuration(budget.actualDurationMs)} / ${formatDuration(budget.budgetDurationMs)} ${budget.exceeded ? "(exceeded)" : "(within budget)"}`
      );
    }
  }

  const failures = [commit, acceptance, release].flatMap((stage) => stage?.failures ?? []);
  if (failures.length > 0) {
    sections.push("- Failed jobs:");
    for (const failure of failures) {
      sections.push(`  - ${failure}`);
    }
  }

  const exceededBudgets = budgetEvaluations.filter((budget) => budget.exceeded);
  if (exceededBudgets.length > 0) {
    sections.push("- Budget breaches:");
    for (const budget of exceededBudgets) {
      sections.push(`  - ${budget.label} exceeded ${formatDuration(budget.budgetDurationMs)}`);
    }
    sections.push("");
    sections.push(
      "Pipeline stayed green, but the lead-time budget was breached. Treat that as delivery work, not background noise."
    );
  }

  if (lineStop) {
    sections.push("");
    sections.push("`main` is red. Stop the line and fix forward before integrating more changes.");
  }

  return {
    sections,
    exceededBudgets
  };
}

export async function writeRunTimingSummary({
  repository,
  runId,
  token,
  summaryFile,
  headline,
  lineStop = false,
  budgets = {}
}) {
  const url = `https://api.github.com/repos/${repository}/actions/runs/${runId}/jobs?per_page=100`;
  const payload = await githubApi(url, token);
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const summary = buildTimingSummary({
    jobs,
    headline,
    lineStop,
    budgets
  });
  await appendFile(summaryFile, `${summary.sections.join("\n")}\n`, "utf8");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await writeRunTimingSummary({
    repository: requireOption(options, "repo"),
    runId: requireOption(options, "run-id"),
    token: process.env.GITHUB_TOKEN ?? requireOption(options, "token"),
    summaryFile: process.env.GITHUB_STEP_SUMMARY ?? requireOption(options, "summary-file"),
    headline: optionalOption(options, "headline") ?? "Pipeline Timing",
    lineStop: String(optionalOption(options, "line-stop") ?? "false") === "true",
    budgets: {
      totalLeadTimeMs: parseBudgetMinutes(optionalOption(options, "total-budget-minutes")),
      commitStageMs: parseBudgetMinutes(optionalOption(options, "commit-budget-minutes")),
      acceptanceStageMs: parseBudgetMinutes(optionalOption(options, "acceptance-budget-minutes")),
      releaseStageMs: parseBudgetMinutes(optionalOption(options, "release-budget-minutes"))
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
