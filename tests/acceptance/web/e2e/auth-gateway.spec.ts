import { test } from "@playwright/test";
import { runSmokeSpec } from "./support/flow-runner";

test("auth gateway flow", async ({ page, baseURL }) => {
  await runSmokeSpec({
    page,
    baseURL,
    options: {
      specId: "auth-gateway",
      expectedEntrypoint: process.env.EXPECTED_ENTRYPOINT ?? "/",
      requireAuthGateway: true,
      smokeChatSendMode: "disabled",
      smokeChatForbiddenCreate: false,
      smokeChatLayout: false
    }
  });
});
