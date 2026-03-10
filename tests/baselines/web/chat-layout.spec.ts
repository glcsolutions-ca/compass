import { test } from "@playwright/test";
import { runSmokeSpec } from "../../acceptance/web/support/flow-runner";

const shouldRunLayout = process.env.SMOKE_CHAT_LAYOUT?.trim().toLowerCase() === "true";

test.skip(!shouldRunLayout, "SMOKE_CHAT_LAYOUT must be true to run layout baselines");

test("chat layout flow", async ({ page, baseURL }) => {
  await runSmokeSpec({
    page,
    baseURL,
    options: {
      specId: "chat-layout",
      expectedEntrypoint: "/chat",
      requireAuthGateway: false,
      smokeChatSendMode: "disabled",
      smokeChatForbiddenCreate: false,
      smokeChatLayout: true
    }
  });
});
