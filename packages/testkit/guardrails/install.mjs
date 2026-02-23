import * as net from "node:net";
import * as tls from "node:tls";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const childProcess = require("node:child_process");

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "::", "0.0.0.0"]);
const STATE_KEY = Symbol.for("compass.testingGuardrails");

function normalizeHost(host) {
  if (!host) {
    return "localhost";
  }

  const trimmed = String(host).trim().toLowerCase();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function toPort(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/u.test(value)) {
    return Number(value);
  }

  return undefined;
}

function isLoopbackHost(host) {
  const normalized = normalizeHost(host);

  if (LOOPBACK_HOSTS.has(normalized)) {
    return true;
  }

  if (normalized.startsWith("127.")) {
    return true;
  }

  return normalized.startsWith("::ffff:127.");
}

function createViolationError({ code, attempted, why, fixes, docPath }) {
  const lines = [
    `Test isolation violation (${code})`,
    `Attempted: ${attempted}`,
    `Why: ${why}`,
    "Fix options:"
  ];

  for (const step of fixes) {
    lines.push(`  - ${step}`);
  }

  lines.push(`See: ${docPath}`);

  const error = new Error(lines.join("\n"));
  error.name = "TestIsolationError";
  return error;
}

function enforceTarget(target, policy) {
  if (target.socketPath) {
    return;
  }

  const host = normalizeHost(target.host);
  const port = toPort(target.port);

  if (!isLoopbackHost(host)) {
    const docPath =
      policy.mode === "integration"
        ? "tests/README.md#isolation-rules"
        : "tests/README.md#unit-tests-many";

    throw createViolationError({
      code: "NET001",
      attempted: `${target.source} -> ${host}${port ? `:${port}` : ""}`,
      why: "Commit-stage and integration tests must avoid external network dependencies.",
      fixes: [
        "Mock the external client at the boundary.",
        "If this must be real browser evidence, move it to tests/e2e and run pnpm test:e2e."
      ],
      docPath
    });
  }

  if (!policy.allowPostgres && port === 5432) {
    throw createViolationError({
      code: "DB001",
      attempted: `${target.source} -> ${host}:5432`,
      why: "Commit-stage tests must be hermetic and cannot use real Postgres.",
      fixes: [
        "Mock DB boundaries in commit-stage tests.",
        "Move DB wiring tests to apps/**/test/integration/**/*.test.ts and run pnpm test:integration."
      ],
      docPath: "tests/README.md#isolation-rules"
    });
  }
}

function parseFetchTarget(input) {
  if (input instanceof URL) {
    return {
      host: input.hostname,
      port: input.port ? Number(input.port) : input.protocol === "https:" ? 443 : 80,
      source: "fetch"
    };
  }

  if (typeof input === "string") {
    if (!/^https?:\/\//u.test(input)) {
      return null;
    }

    const url = new URL(input);
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      source: "fetch"
    };
  }

  if (input && typeof input === "object" && typeof input.url === "string") {
    if (!/^https?:\/\//u.test(input.url)) {
      return null;
    }

    const url = new URL(input.url);
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      source: "fetch"
    };
  }

  return null;
}

function parseSocketTarget(args, source) {
  const first = args[0];
  const second = args[1];

  if (typeof first === "number") {
    return {
      host: typeof second === "string" ? second : "localhost",
      port: first,
      source
    };
  }

  if (typeof first === "string") {
    if (first.startsWith("/")) {
      return {
        socketPath: first,
        source
      };
    }

    return {
      host: first,
      source
    };
  }

  if (first && typeof first === "object") {
    if (typeof first.path === "string" && first.path.length > 0) {
      return {
        socketPath: first.path,
        source
      };
    }

    return {
      host: first.host ?? first.hostname ?? "localhost",
      port: first.port,
      source
    };
  }

  return {
    host: "localhost",
    source
  };
}

function installNetworkGuards(policy) {
  const originalFetch =
    typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
  if (originalFetch) {
    globalThis.fetch = async (input, init) => {
      const target = parseFetchTarget(input);
      if (target) {
        enforceTarget(target, policy);
      }

      return originalFetch(input, init);
    };
  }

  const originalSocketConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedSocketConnect(...args) {
    enforceTarget(parseSocketTarget(args, "net.Socket.connect"), policy);
    return originalSocketConnect.apply(this, args);
  };

  const tlsSocketConnect = tls.TLSSocket?.prototype?.connect;
  if (typeof tlsSocketConnect === "function") {
    tls.TLSSocket.prototype.connect = function guardedTlsSocketConnect(...args) {
      enforceTarget(parseSocketTarget(args, "tls.TLSSocket.connect"), policy);
      return tlsSocketConnect.apply(this, args);
    };
  }
}

function installProcessGuards() {
  const blocked = (name) => {
    throw createViolationError({
      code: "PROC001",
      attempted: name,
      why: "Commit-stage tests should not shell out to external tooling.",
      fixes: [
        "Refactor the test to run in-process with mocks/fakes.",
        "If process execution is required evidence, move it to integration/system coverage."
      ],
      docPath: "tests/README.md#determinism-rules"
    });
  };

  childProcess.exec = () => blocked("child_process.exec");
  childProcess.execSync = () => blocked("child_process.execSync");
  childProcess.execFile = () => blocked("child_process.execFile");
  childProcess.execFileSync = () => blocked("child_process.execFileSync");
  childProcess.spawn = () => blocked("child_process.spawn");
  childProcess.spawnSync = () => blocked("child_process.spawnSync");
  childProcess.fork = () => blocked("child_process.fork");
}

export function installTestGuardrails(policy) {
  const globalState = globalThis[STATE_KEY] ?? { installed: new Set() };
  globalThis[STATE_KEY] = globalState;

  const policyKey = JSON.stringify({
    mode: policy.mode,
    allowPostgres: policy.allowPostgres,
    blockChildProcess: policy.blockChildProcess
  });

  if (globalState.installed.has(policyKey)) {
    return;
  }

  installNetworkGuards(policy);

  if (policy.blockChildProcess) {
    installProcessGuards();
  }

  globalState.installed.add(policyKey);
}
