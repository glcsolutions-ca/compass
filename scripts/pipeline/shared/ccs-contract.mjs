function normalizeLine(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return [];
  }

  return commands
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function defaultFix(guardrailId) {
  return `Restore ${guardrailId} contract conditions.`;
}

function defaultDoCommands(command) {
  const doCommands = [];
  if (typeof command === "string" && command.trim().length > 0) {
    doCommands.push(command.trim());
  }
  doCommands.push("pnpm test:quick");
  return doCommands;
}

export class CcsError extends Error {
  constructor({ code, why, fix, doCommands = [], ref }) {
    super(normalizeLine(why, "Guardrail failed."));
    this.name = "CcsError";
    this.code = normalizeLine(code, "CCS_UNSPECIFIED_FAILURE");
    this.why = normalizeLine(why, "Guardrail failed.");
    this.fix = normalizeLine(fix, "Apply the required guardrail fix.");
    this.doCommands = normalizeCommands(doCommands);
    this.ref = normalizeLine(ref, "docs/ccs.md#output-format");
  }
}

export function createCcsError(payload) {
  return new CcsError(payload);
}

export function emitPass({ guardrailId, code, logger = console }) {
  logger.info(`CCS:PASS ${guardrailId} CODE:${code}`);
}

export function emitFail({ guardrailId, code, why, fix, doCommands, ref, logger = console }) {
  const normalizedWhy = normalizeLine(why, "Guardrail contract failed.");
  const normalizedFix = normalizeLine(fix, defaultFix(guardrailId));
  const normalizedDo = normalizeCommands(doCommands);
  const finalDo = normalizedDo.length > 0 ? normalizedDo : defaultDoCommands();
  const normalizedRef = normalizeLine(ref, "docs/ccs.md#output-format");

  logger.error(`CCS:FAIL ${guardrailId} CODE:${code}`);
  logger.error(`WHY: ${normalizedWhy}`);
  logger.error(`FIX: ${normalizedFix}`);
  logger.error("DO:");
  for (const command of finalDo) {
    logger.error(command);
  }
  logger.error(`REF: ${normalizedRef}`);
}

export function toCcsFailure({ guardrailId, error, command, ref }) {
  if (error instanceof CcsError) {
    return {
      code: error.code,
      why: error.why,
      fix: error.fix,
      doCommands: error.doCommands,
      ref: error.ref
    };
  }

  const message = error instanceof Error ? error.message : String(error);

  return {
    code: "CCS_UNEXPECTED_ERROR",
    why: normalizeLine(message, "Unexpected guardrail runtime error."),
    fix: defaultFix(guardrailId),
    doCommands: defaultDoCommands(command),
    ref: normalizeLine(ref, "docs/ccs.md#output-format")
  };
}

export async function withCcsGuardrail({
  guardrailId,
  command,
  passCode = "CCS000",
  passRef = "docs/ccs.md#output-format",
  run,
  mapError,
  logger = console,
  setExitCode = (code) => {
    process.exitCode = code;
  }
}) {
  try {
    const result = await run();
    const status = result?.status ?? "pass";

    if (status === "fail") {
      emitFail({
        guardrailId,
        code: normalizeLine(result.code ?? result.reasonCode, "CCS_FAIL"),
        why: result.why,
        fix: result.fix,
        doCommands: result.doCommands,
        ref: result.ref ?? passRef,
        logger
      });
      setExitCode(1);
      return result;
    }

    emitPass({
      guardrailId,
      code: normalizeLine(result?.code ?? result?.reasonCode, passCode),
      logger
    });
    return result ?? { status: "pass", code: passCode, ref: passRef };
  } catch (error) {
    const fallback = toCcsFailure({ guardrailId, error, command, ref: passRef });
    let mapped = fallback;

    if (!(error instanceof CcsError) && typeof mapError === "function") {
      const override = mapError(error, { guardrailId, command, passRef });
      if (override && typeof override === "object") {
        mapped = { ...fallback, ...override };
      }
    }

    emitFail({
      guardrailId,
      code: normalizeLine(mapped.code, "CCS_UNEXPECTED_ERROR"),
      why: mapped.why,
      fix: mapped.fix,
      doCommands: mapped.doCommands,
      ref: mapped.ref ?? passRef,
      logger
    });
    setExitCode(1);
    return { status: "fail", ...mapped };
  }
}
