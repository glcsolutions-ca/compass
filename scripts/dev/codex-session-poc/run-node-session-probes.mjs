import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const resourceGroup = process.env.RESOURCE_GROUP ?? "rg-compass-spike-codex-ci-001";
const sessionPool = process.env.SESSION_POOL ?? "sp-compass-codex-node-poc-001";
const location = process.env.LOCATION ?? "westus3";
const identifier = process.env.IDENTIFIER ?? "probe-relay";
const remoteDir = process.env.REMOTE_DIR ?? "/mnt/data/codex-session-poc";
const publicEchoWsUrl = process.env.PUBLIC_ECHO_WS_URL ?? "wss://ws.postman-echo.com/raw";
const controlPlaneWsUrl = process.env.CONTROL_PLANE_WS_URL ?? "";
const outDir =
  process.env.OUT_DIR ??
  path.join(
    os.tmpdir(),
    "compass-codex-session-poc",
    new Date().toISOString().replaceAll(":", "-")
  );

fs.mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runExec(name, timeoutSeconds, code) {
  const output = execFileSync(
    "az",
    [
      "containerapp",
      "session",
      "code-interpreter",
      "execute",
      "--name",
      sessionPool,
      "--resource-group",
      resourceGroup,
      "--session-pool-location",
      location,
      "--identifier",
      identifier,
      "--timeout-in-seconds",
      String(timeoutSeconds),
      "--code",
      code,
      "--only-show-errors",
      "--output",
      "json"
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(file, output);
  return JSON.parse(output);
}

function summarize(name, result) {
  console.log(`\n== ${name} ==`);
  console.log(`status: ${result.status}`);
  if (result.result?.stdout) {
    console.log(`stdout:\n${result.result.stdout}`);
  }
  if (result.result?.stderr) {
    console.log(`stderr:\n${result.result.stderr}`);
  }
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`probe failed: ${label} missing '${needle}'`);
  }
}

const remotePreamble = `(() => {
  const fs = require("fs");
  fs.mkdirSync(${JSON.stringify(remoteDir)}, { recursive: true });
`;

const remotePostamble = "\n})();";

function wrap(body) {
  return `${remotePreamble}${body}${remotePostamble}`;
}

const simple = runExec("01-simple-exec", 30, wrap('  console.log("hello from node session");'));
summarize("simple-exec", simple);
assertContains(simple.result.stdout, "hello from node session", "simple exec");

const heartbeatStart = runExec(
  "02-heartbeat-start",
  30,
  wrap(`
  const { spawn } = require("child_process");
  const heartbeat = ${JSON.stringify(`${remoteDir}/relay-heartbeat.txt`)};
  fs.writeFileSync(heartbeat, "start\\n");
  const child = spawn(process.execPath, [
    "-e",
    ${JSON.stringify(
      `const fs=require("fs"); setInterval(() => fs.appendFileSync(${JSON.stringify(
        `${remoteDir}/relay-heartbeat.txt`
      )}, Date.now() + "\\n"), 1000);`
    )}
  ], { detached: true, stdio: "ignore" });
  child.unref();
  console.log("spawned=" + child.pid);
`)
);
summarize("heartbeat-start", heartbeatStart);

const heartbeatPidMatch = /^spawned=(\d+)$/m.exec(heartbeatStart.result.stdout);
if (!heartbeatPidMatch) {
  throw new Error("probe failed: could not parse heartbeat pid");
}
const heartbeatPid = Number(heartbeatPidMatch[1]);

await sleep(5000);

const heartbeatVerify = runExec(
  "03-heartbeat-verify",
  30,
  wrap(`
  const heartbeat = ${JSON.stringify(`${remoteDir}/relay-heartbeat.txt`)};
  const lines = fs.readFileSync(heartbeat, "utf8").trim().split(/\\n/);
  console.log("line_count=" + lines.length);
  console.log("tail=" + lines.slice(-3).join(","));
  try {
    process.kill(${heartbeatPid}, 0);
    console.log("pid_alive=true");
  } catch {
    console.log("pid_alive=false");
  }
`)
);
summarize("heartbeat-verify", heartbeatVerify);
assertContains(heartbeatVerify.result.stdout, "pid_alive=true", "heartbeat verify");

const heartbeatCleanup = runExec(
  "04-heartbeat-cleanup",
  30,
  wrap(`
  try {
    process.kill(${heartbeatPid}, "SIGTERM");
    console.log("killed=true");
  } catch {
    console.log("killed=false");
  }
`)
);
summarize("heartbeat-cleanup", heartbeatCleanup);

const installWs = runExec(
  "05-install-ws",
  120,
  wrap(`
  const { execSync } = require("child_process");
  execSync(
    ${JSON.stringify(
      `mkdir -p ${remoteDir}/wsprobe && npm install ws@8 --prefix ${remoteDir}/wsprobe`
    )},
    { stdio: "inherit" }
  );
  console.log("installed-to-remote-dir");
`)
);
summarize("install-ws", installWs);
assertContains(installWs.result.stdout, "installed-to-remote-dir", "ws install");

const publicEchoStart = runExec(
  "06-public-echo-start",
  40,
  wrap(`
  const { spawn } = require("child_process");
  const script = ${JSON.stringify(`${remoteDir}/public-echo-child.js`)};
  const log = ${JSON.stringify(`${remoteDir}/public-echo.log`)};
  const out = ${JSON.stringify(`${remoteDir}/public-echo.out`)};
  const err = ${JSON.stringify(`${remoteDir}/public-echo.err`)};
  fs.writeFileSync(log, "start\\n");
  fs.writeFileSync(out, "");
  fs.writeFileSync(err, "");
  const childSource = [
    'const fs = require("fs");',
    'const WebSocket = require(${JSON.stringify(`${remoteDir}/wsprobe/node_modules/ws`)});',
    'const append = (line) => fs.appendFileSync(${JSON.stringify(
      `${remoteDir}/public-echo.log`
    )}, line + "\\\\n");',
    'append("boot");',
    'const ws = new WebSocket(${JSON.stringify(publicEchoWsUrl)});',
    'ws.on("open", () => { append("open"); ws.send("relay-probe-123"); });',
    'ws.on("message", (data) => { append("message=" + data.toString()); ws.close(); });',
    'ws.on("error", (error) => { append("error=" + error.message); process.exit(1); });',
    'ws.on("close", () => { append("close"); process.exit(0); });',
    'setTimeout(() => { append("timeout"); process.exit(2); }, 10000);'
  ].join("\\n");
  fs.writeFileSync(script, childSource);
  const outFd = fs.openSync(out, "a");
  const errFd = fs.openSync(err, "a");
  const child = spawn("node", [script], {
    detached: true,
    stdio: ["ignore", outFd, errFd],
  });
  child.unref();
  console.log("spawned=" + child.pid);
`)
);
summarize("public-echo-start", publicEchoStart);

await sleep(8000);

const publicEchoVerify = runExec(
  "07-public-echo-verify",
  30,
  wrap(`
  console.log(fs.readFileSync(${JSON.stringify(`${remoteDir}/public-echo.log`)}, "utf8"));
`)
);
summarize("public-echo-verify", publicEchoVerify);
assertContains(publicEchoVerify.result.stdout, "open", "public echo verify");
assertContains(publicEchoVerify.result.stdout, "message=relay-probe-123", "public echo verify");

if (controlPlaneWsUrl) {
  const controlPlaneStart = runExec(
    "08-control-plane-start",
    40,
    wrap(`
  const { spawn } = require("child_process");
  const script = ${JSON.stringify(`${remoteDir}/control-plane-child.js`)};
  const log = ${JSON.stringify(`${remoteDir}/control-plane.log`)};
  const out = ${JSON.stringify(`${remoteDir}/control-plane.out`)};
  const err = ${JSON.stringify(`${remoteDir}/control-plane.err`)};
  fs.writeFileSync(log, "start\\n");
  fs.writeFileSync(out, "");
  fs.writeFileSync(err, "");
  const childSource = [
    'const fs = require("fs");',
    'const WebSocket = require(${JSON.stringify(`${remoteDir}/wsprobe/node_modules/ws`)});',
    'const append = (line) => fs.appendFileSync(${JSON.stringify(
      `${remoteDir}/control-plane.log`
    )}, line + "\\\\n");',
    'append("boot");',
    'const ws = new WebSocket(${JSON.stringify(controlPlaneWsUrl)});',
    'ws.on("open", () => { append("open"); ws.send("hello-from-azure-session"); });',
    'ws.on("message", (data) => { append("message=" + data.toString()); ws.close(); });',
    'ws.on("error", (error) => { append("error=" + error.message); process.exit(1); });',
    'ws.on("close", () => { append("close"); process.exit(0); });',
    'setTimeout(() => { append("timeout"); process.exit(2); }, 10000);'
  ].join("\\n");
  fs.writeFileSync(script, childSource);
  const outFd = fs.openSync(out, "a");
  const errFd = fs.openSync(err, "a");
  const child = spawn("node", [script], {
    detached: true,
    stdio: ["ignore", outFd, errFd],
  });
  child.unref();
  console.log("spawned=" + child.pid);
`)
  );
  summarize("control-plane-start", controlPlaneStart);

  await sleep(8000);

  const controlPlaneVerify = runExec(
    "09-control-plane-verify",
    30,
    wrap(`
  console.log(fs.readFileSync(${JSON.stringify(`${remoteDir}/control-plane.log`)}, "utf8"));
`)
  );
  summarize("control-plane-verify", controlPlaneVerify);
  assertContains(controlPlaneVerify.result.stdout, "open", "control-plane verify");
  assertContains(
    controlPlaneVerify.result.stdout,
    "message=control-ack:hello-from-azure-session",
    "control-plane verify"
  );
}

console.log(`\nProbe outputs written to ${outDir}`);
