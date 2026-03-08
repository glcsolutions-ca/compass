import { DEFAULT_SETTINGS_SECTION, type SettingsSection } from "~/features/settings/types";

export function resolveSettingsSection(value: string | null | undefined): SettingsSection {
  return value === "personalization" ? "personalization" : DEFAULT_SETTINGS_SECTION;
}

export function buildSettingsHref(section?: SettingsSection | null): string {
  if (!section) {
    return "/settings";
  }

  return `/settings/${encodeURIComponent(resolveSettingsSection(section))}`;
}
