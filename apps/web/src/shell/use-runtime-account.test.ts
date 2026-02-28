import { describe, expect, it } from "vitest";
import type { RuntimeNotification } from "@compass/contracts";
import { __private__ } from "~/components/shell/use-runtime-account";

describe("use-runtime-account helpers", () => {
  it("reads successful login completion and clears pending state", () => {
    const notification = {
      method: "account/login/completed",
      params: {
        loginId: "login_123",
        success: true,
        error: null
      }
    } as RuntimeNotification;

    expect(__private__.readLoginCompletion(notification)).toEqual({
      loginId: "login_123",
      success: true,
      error: null
    });
  });

  it("reads failed login completion and returns error message", () => {
    const notification = {
      method: "account/login/completed",
      params: {
        success: false,
        error: "Authorization failed"
      }
    } as RuntimeNotification;

    expect(__private__.readLoginCompletion(notification)).toEqual({
      loginId: null,
      success: false,
      error: "Authorization failed"
    });
  });

  it("applies rate limit updates without dropping existing buckets", () => {
    const notification = {
      method: "account/rateLimits/updated",
      params: {
        rateLimits: {
          limitId: "codex_other",
          limitName: "codex_other",
          primary: {
            usedPercent: 42,
            windowDurationMins: 60,
            resetsAt: 1_730_950_800
          },
          secondary: null
        }
      }
    } as RuntimeNotification;

    const updated = __private__.applyRateLimitUpdate(
      {
        rateLimits: {
          limitId: "codex",
          limitName: null,
          primary: {
            usedPercent: 25,
            windowDurationMins: 15,
            resetsAt: 1_730_947_200
          },
          secondary: null
        },
        rateLimitsByLimitId: {
          codex: {
            limitId: "codex",
            limitName: null,
            primary: {
              usedPercent: 25,
              windowDurationMins: 15,
              resetsAt: 1_730_947_200
            },
            secondary: null
          }
        }
      },
      notification
    );

    expect(updated?.rateLimits?.limitId).toBe("codex_other");
    expect(updated?.rateLimitsByLimitId).toMatchObject({
      codex: {
        limitId: "codex"
      },
      codex_other: {
        limitId: "codex_other"
      }
    });
  });
});
