import type {
  SettingsModalState,
  SettingsModalUrlState,
  SettingsSection
} from "~/features/settings/types";

export const SETTINGS_MODAL_QUERY_KEY = "modal";
export const SETTINGS_MODAL_QUERY_VALUE = "settings";
export const SETTINGS_SECTION_QUERY_KEY = "section";
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "general";

function parseSettingsSection(value: string | null): SettingsSection {
  if (value === "personalization") {
    return "personalization";
  }

  return "general";
}

export function parseSettingsModalState(location: { search: string }): SettingsModalState {
  const params = new URLSearchParams(location.search);
  const isOpen = params.get(SETTINGS_MODAL_QUERY_KEY) === SETTINGS_MODAL_QUERY_VALUE;

  return {
    isOpen,
    section: parseSettingsSection(params.get(SETTINGS_SECTION_QUERY_KEY))
  };
}

export function buildSettingsModalUrl(
  location: { pathname: string; search: string; hash: string },
  nextState: SettingsModalUrlState
): string {
  const params = new URLSearchParams(location.search);

  if (nextState.open) {
    params.set(SETTINGS_MODAL_QUERY_KEY, SETTINGS_MODAL_QUERY_VALUE);
    params.set(SETTINGS_SECTION_QUERY_KEY, nextState.section ?? DEFAULT_SETTINGS_SECTION);
  } else {
    params.delete(SETTINGS_MODAL_QUERY_KEY);
    params.delete(SETTINGS_SECTION_QUERY_KEY);
  }

  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;
}
