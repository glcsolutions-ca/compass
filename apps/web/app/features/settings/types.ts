export type SettingsSection = "general" | "personalization";

export interface SettingsModalState {
  isOpen: boolean;
  section: SettingsSection;
}

export interface SettingsModalUrlState {
  open: boolean;
  section?: SettingsSection;
}
