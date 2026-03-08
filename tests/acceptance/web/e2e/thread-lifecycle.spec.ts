import { test } from "@playwright/test";
import { parseFlag, parseSmokeChatSendMode, runSmokeSpec } from "./support/flow-runner";

const configuredSendMode = parseSmokeChatSendMode(process.env.SMOKE_CHAT_SEND);

test.skip(
  configuredSendMode === "disabled",
  "SMOKE_CHAT_SEND=disabled skips thread lifecycle acceptance"
);

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
