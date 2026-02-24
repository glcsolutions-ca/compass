import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "./repository.js";

describe("InMemoryRepository", () => {
  it("stores and reads thread, turn, item, event, and approval state", async () => {
    const repository = new InMemoryRepository();

    await repository.upsertThread({
      id: "thr_1",
      name: "Thread 1",
      status: "active"
    });
    await repository.upsertTurn(
      "thr_1",
      {
        id: "turn_1",
        status: "inProgress"
      },
      [{ type: "text", text: "hello" }]
    );
    await repository.upsertItem("thr_1", "turn_1", { id: "item_1", type: "message" }, "started");
    await repository.insertEvent("thr_1", "turn_1", "turn/started", {
      threadId: "thr_1",
      turnId: "turn_1"
    });
    await repository.insertApproval("approval_1", "item/commandExecution/requestApproval", {
      threadId: "thr_1",
      turnId: "turn_1",
      reason: "Need approval"
    });
    await repository.resolveApproval("approval_1", "accept");
    await repository.upsertAuthState("apiKey", { type: "apiKey" });

    const details = await repository.readThread("thr_1");
    expect(details).not.toBeNull();
    expect(details?.thread.threadId).toBe("thr_1");
    expect(details?.turns).toHaveLength(1);
    expect(details?.items).toHaveLength(1);
    expect(details?.events).toHaveLength(1);
    expect(details?.approvals).toHaveLength(1);
    expect(
      (
        details?.approvals[0] as {
          status?: string;
          decision?: string;
        }
      ).status
    ).toBe("resolved");
    expect(
      (
        details?.approvals[0] as {
          decision?: string;
        }
      ).decision
    ).toBe("accept");
  });

  it("lists recent threads", async () => {
    const repository = new InMemoryRepository();

    await repository.upsertThread({
      id: "thr_A",
      name: "A",
      status: "active"
    });
    await repository.upsertThread({
      id: "thr_B",
      name: "B",
      status: "active"
    });

    const list = await repository.listThreads(10);
    const threadIds = list.map((thread) => thread.threadId);

    expect(threadIds).toContain("thr_A");
    expect(threadIds).toContain("thr_B");
  });
});
