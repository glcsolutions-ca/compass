# Codex App Server on Azure Code Interpreter Sessions POC

Validated live on March 6, 2026.

This spike stays intentionally outside the delivery pipeline. It is a manual
probe for one question: can an Azure Container Apps code-interpreter session
host a long-lived relay process that calls back to an external control plane?

## Scope

- Create a throwaway `NodeLTS` session pool with Azure CLI.
- Reuse a single session identifier across multiple execute calls.
- Verify plain code execution.
- Verify outbound HTTPS egress.
- Verify a detached background process survives across execute calls.
- Verify a detached child process can load a dynamically installed websocket
  client from durable session storage and call out to:
  - a public websocket echo endpoint
  - a locally hosted control plane exposed through a temporary tunnel

This does not yet run the real `codex app-server` binary in-session. The point
of the spike is the transport boundary and relay shape, not the full Codex
bootstrap.

## Scripts

- `scripts/dev/codex-session-poc/create-node-session-pool.sh`
- `scripts/dev/codex-session-poc/run-node-session-probes.sh`
- `scripts/dev/codex-session-poc/start-local-control-plane.sh`
- `scripts/dev/codex-session-poc/start-local-tunnel.sh`
- `scripts/dev/codex-session-poc/delete-poc-resource-group.sh`

## What We Verified Live

Using:

- Azure CLI `2.83.0`
- `containerapp` extension `1.3.0b2`
- Region `westus3`
- Session pool type `NodeLTS`

Observed results:

- `az containerapp sessionpool create` works for `NodeLTS` pools.
- `az containerapp session code-interpreter execute` works against that pool.
- Session reuse is keyed by `--identifier`.
- The Node execution context is sticky enough that top-level declarations can
  collide across repeated execute calls on the same identifier.
- A detached child process started inside the session remains alive for later
  execute calls on the same identifier.
- Plain HTTPS egress works when the pool is created with
  `--network-status EgressEnabled`.
- `npm install` into `/mnt/data` survives across later execute calls.
- `npm install` into `/tmp` was not reliable enough for this use case.
- A detached child process using `ws@8` from `/mnt/data` successfully connected
  to a public websocket echo endpoint and received the echoed payload back.
- A detached child process using `ws@8` from `/mnt/data` also connected to a
  local websocket control plane exposed through `localtunnel`, sent
  `hello-from-azure-session`, and received
  `control-ack:hello-from-azure-session`.

That is enough to say: a session-resident relay that calls home to an external
controller is technically possible in Azure code-interpreter sessions.

## Important Runtime Notes

- Use `/mnt/data` for anything the relay must keep between execute calls:
  package installs, relay bundle, Codex cache, logs, and transcripts.
- Do not rely on the session runtime exposing a built-in websocket global.
  Vendor a client library into `/mnt/data` or ship a single-file relay bundle.
- Reuse one session identifier for repeated probes. Creating a fresh identifier
  per run quickly exhausts the pool's active-session limit until cooldown
  expires.
- Detached processes must be managed explicitly. A heartbeat probe kept running
  until it was killed.

## What We Did Not Prove Yet

- Running the real `codex app-server` binary inside the session.
- Bridging live JSON-RPC between a real control plane and `codex app-server`.
- Authentication shape for the relay and control plane.
- Long-running behavior past the session cooldown boundary.
- Whether `NodeLTS` or `Shell` is the better target once the real app-server
  binary is involved.

## Recommended Next Step

Run a second spike that keeps the same session-pool and relay shape, but swaps
the probe child for:

1. a pinned `codex` binary unpacked into `/mnt/data/codex/bin`
2. a minimal relay process that starts `codex app-server` as a child
3. a tiny external controller that performs `initialize`, `thread/start`, and a
   trivial `turn/start`

If that works, the remaining work is packaging and operational polish, not basic
feasibility.

## Manual Reproduction

1. Create the pool:

   ```bash
   scripts/dev/codex-session-poc/create-node-session-pool.sh
   ```

2. Start the local control plane in one terminal:

   ```bash
   scripts/dev/codex-session-poc/start-local-control-plane.sh
   ```

3. Start a tunnel in a second terminal and copy the URL:

   ```bash
   scripts/dev/codex-session-poc/start-local-tunnel.sh
   ```

4. Run the probes:

   ```bash
   CONTROL_PLANE_WS_URL="wss://<your-localtunnel-host>" \
   scripts/dev/codex-session-poc/run-node-session-probes.sh
   ```

5. Tear the spike down when done:

   ```bash
   scripts/dev/codex-session-poc/delete-poc-resource-group.sh
   ```

## Live Verdict

The relay and control-plane concept is viable on Azure code-interpreter
sessions, with two constraints:

- the relay should use durable storage under `/mnt/data`
- the real proof still needed is `codex app-server` itself, not the websocket
  plumbing around it
