import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { CodexRpcClient } from "./rpc-client.js";

describe("CodexRpcClient", () => {
  const clients = new Set<CodexRpcClient>();

  afterEach(() => {
    for (const client of clients) {
      client.close();
    }
    clients.clear();
  });

  it("correlates request responses by id", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const client = new CodexRpcClient(readable, writable);
    clients.add(client);

    const requestPromise = client.request("thread/start", { cwd: "/repo" });

    const outgoingRaw = await readSingleLine(writable);
    const outgoing = JSON.parse(outgoingRaw) as { id: string; method: string };

    readable.write(
      `${JSON.stringify({
        id: outgoing.id,
        result: { thread: { id: "thr_1" } }
      })}\n`
    );

    await expect(requestPromise).resolves.toEqual({ thread: { id: "thr_1" } });
  });

  it("emits server requests", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const client = new CodexRpcClient(readable, writable);
    clients.add(client);

    const messagePromise = new Promise<{ id: string; method: string }>((resolve) => {
      client.on("request", (request) => {
        resolve({ id: String(request.id), method: request.method });
      });
    });

    readable.write(
      `${JSON.stringify({
        id: "99",
        method: "item/commandExecution/requestApproval",
        params: { threadId: "thr_1" }
      })}\n`
    );

    await expect(messagePromise).resolves.toEqual({
      id: "99",
      method: "item/commandExecution/requestApproval"
    });
  });

  it("emits notifications", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const client = new CodexRpcClient(readable, writable);
    clients.add(client);

    const notificationPromise = new Promise<string>((resolve) => {
      client.on("notification", (notification) => {
        resolve(notification.method);
      });
    });

    readable.write(
      `${JSON.stringify({
        method: "turn/completed",
        params: { threadId: "thr_1" }
      })}\n`
    );

    await expect(notificationPromise).resolves.toBe("turn/completed");
  });

  it("rejects pending requests when the transport closes", async () => {
    const readable = new PassThrough();
    const writable = new PassThrough();
    const client = new CodexRpcClient(readable, writable);
    clients.add(client);

    const requestPromise = client.request("thread/start", {});
    await readSingleLine(writable);

    readable.end();
    await expect(requestPromise).rejects.toThrow(
      "RPC connection closed before response for thread/start"
    );
  });
});

async function readSingleLine(stream: PassThrough): Promise<string> {
  const dataPromise = new Promise<string>((resolve) => {
    stream.once("data", (chunk: Buffer) => {
      resolve(chunk.toString("utf8").trim());
    });
  });

  const timeoutPromise = delay(1_000).then(() => {
    throw new Error("Timed out waiting for stream output");
  });

  return Promise.race([dataPromise, timeoutPromise]);
}
