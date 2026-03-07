import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachSessionAgentGateway } from "../../src/modules/runtime/gateway.js";
import { LocalProcessSessionHost } from "../../src/infrastructure/runtime-hosts/local-process.js";
import { SessionControlPlane } from "../../src/modules/runtime/session-control-plane.js";

describe("local process session agent integration", () => {
  let tempDir = "";
  let server: ReturnType<typeof createServer> | null = null;
  let controlPlane: SessionControlPlane | null = null;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "compass-runtime-agent-"));
    server = createServer((_request, response) => {
      response.statusCode = 404;
      response.end();
    });

    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected an ephemeral TCP port for the test server");
    }

    controlPlane = new SessionControlPlane({
      loopbackBaseUrl: `http://127.0.0.1:${String(address.port)}`,
      publicBaseUrl: null,
      connectTokenSecret: "integration-secret",
      bootstrapTimeoutMs: 20_000,
      responseTimeoutMs: 5_000,
      hosts: [
        new LocalProcessSessionHost({
          workRoot: tempDir
        })
      ],
      now: () => new Date()
    });

    attachSessionAgentGateway({
      server,
      controlPlane,
      now: () => new Date()
    });
  });

  afterAll(async () => {
    controlPlane?.close();
    if (server) {
      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
      });
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("boots once and then reuses the same local session agent", async () => {
    if (!controlPlane) {
      throw new Error("Expected control plane to be initialized");
    }

    const thread = {
      threadId: "thread-local-1",
      sessionIdentifier: "thr-thread-local-1",
      executionHost: "desktop_local" as const
    };

    const first = await controlPlane.runTurn({
      thread,
      turnId: "turn-1",
      text: "hello from integration"
    });
    const second = await controlPlane.runTurn({
      thread,
      turnId: "turn-2",
      text: "second pass"
    });

    expect(first.outputText).toBe("echo:hello from integration");
    expect(first.runtime.connectionState).toBe("bootstrapped");
    expect(first.runtime.runtimeKind).toBe("echo");
    expect(first.runtime.pid).toEqual(expect.any(Number));

    expect(second.outputText).toBe("echo:second pass");
    expect(second.runtime.connectionState).toBe("reused");
    expect(second.runtime.bootId).toBe(first.runtime.bootId);
    expect(second.runtime.pid).toBe(first.runtime.pid);
  });
});
