import { test } from "@playwright/test";
import { runSmokeSpec } from "./support/flow-runner";

test("chat surface flow", async ({ page, baseURL }) => {
  await runSmokeSpec({
    page,
    baseURL,
    options: {
      specId: "chat-surface",
      expectedEntrypoint: "/chat",
      requireAuthGateway: false,
      smokeChatSendMode: "auto",
      smokeChatForbiddenCreate: false,
      smokeChatLayout: false
    }
  });
});
