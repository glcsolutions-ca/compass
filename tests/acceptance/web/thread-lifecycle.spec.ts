import { test } from "@playwright/test";
import { parseFlag, runSmokeSpec } from "./support/flow-runner";

test("thread lifecycle flow", async ({ page, baseURL }) => {
  await runSmokeSpec({
    page,
    baseURL,
    options: {
      specId: "thread-lifecycle",
      expectedEntrypoint: "/chat",
      requireAuthGateway: false,
      smokeChatSendMode: "required",
      smokeChatForbiddenCreate: parseFlag(process.env.SMOKE_CHAT_FORBIDDEN_CREATE, false),
      smokeChatLayout: false
    }
  });
});
