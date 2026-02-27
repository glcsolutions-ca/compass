import { describe, expect, it } from "vitest";
import {
  buildSettingsModalUrl,
  parseSettingsModalState
} from "~/features/settings/settings-modal-state";

describe("settings modal URL state", () => {
  it("parses open state and section from search params", () => {
    expect(parseSettingsModalState({ search: "?modal=settings&section=personalization" })).toEqual({
      isOpen: true,
      section: "personalization"
    });
  });

  it("falls back to general section when query is invalid", () => {
    expect(parseSettingsModalState({ search: "?modal=settings&section=unknown" })).toEqual({
      isOpen: true,
      section: "general"
    });
  });

  it("builds an open modal URL and preserves unrelated query and hash", () => {
    const href = buildSettingsModalUrl(
      {
        pathname: "/t/acme/chat",
        search: "?foo=1",
        hash: "#anchor"
      },
      {
        open: true,
        section: "general"
      }
    );

    expect(href).toBe("/t/acme/chat?foo=1&modal=settings&section=general#anchor");
  });

  it("removes modal keys but keeps unrelated params on close", () => {
    const href = buildSettingsModalUrl(
      {
        pathname: "/t/acme/chat",
        search: "?foo=1&modal=settings&section=personalization&bar=2",
        hash: ""
      },
      {
        open: false
      }
    );

    expect(href).toBe("/t/acme/chat?foo=1&bar=2");
  });
});
