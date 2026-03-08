export type SettingsSection = "general" | "personalization";
export const DEFAULT_SETTINGS_SECTION: SettingsSection = "general";

export interface SettingsModalState {
  isOpen: boolean;
  section: SettingsSection;
}

export interface SettingsModalUrlState {
  open: boolean;
  section?: SettingsSection;
}
