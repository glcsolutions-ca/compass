export const UI_THEME_STORAGE_KEY = "ui-theme";
export const UI_MODE_STORAGE_KEY = "ui-mode";

const UI_THEME_IDS = ["compass", "slate", "rose"] as const;
const UI_MODE_IDS = ["system", "light", "dark"] as const;

export type UiThemeId = (typeof UI_THEME_IDS)[number];
export type UiMode = (typeof UI_MODE_IDS)[number];
export type EffectiveUiMode = Extract<UiMode, "light" | "dark">;

export interface ThemePreference {
  theme: UiThemeId;
  mode: UiMode;
}

export interface ThemeOption {
  id: UiThemeId;
  label: string;
  description: string;
  swatches: {
    primary: string;
    accent: string;
    ring: string;
  };
}

export interface ModeOption {
  id: UiMode;
  label: string;
  description: string;
}

export const DEFAULT_UI_THEME: UiThemeId = "compass";
export const DEFAULT_UI_MODE: UiMode = "system";

export const UI_THEME_OPTIONS: ThemeOption[] = [
  {
    id: "compass",
    label: "Compass",
    description: "Balanced blue accent.",
    swatches: {
      primary: "217 100% 56%",
      accent: "210 20% 93%",
      ring: "217 100% 56%"
    }
  },
  {
    id: "slate",
    label: "Slate",
    description: "Neutral graphite accent.",
    swatches: {
      primary: "215 20% 42%",
      accent: "215 20% 92%",
      ring: "215 20% 42%"
    }
  },
  {
    id: "rose",
    label: "Rose",
    description: "Warm rose accent.",
    swatches: {
      primary: "346 77% 49%",
      accent: "346 35% 93%",
      ring: "346 77% 49%"
    }
  }
];

export const UI_MODE_OPTIONS: ModeOption[] = [
  {
    id: "system",
    label: "System",
    description: "Follow your device preference."
  },
  {
    id: "light",
    label: "Light",
    description: "Always use the light appearance."
  },
  {
    id: "dark",
    label: "Dark",
    description: "Always use the dark appearance."
  }
];

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?: (key: string) => void;
}

function readStorage(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write failures in restricted browser contexts.
  }
}

function isTheme(value: string | null | undefined): value is UiThemeId {
  return typeof value === "string" && (UI_THEME_IDS as readonly string[]).includes(value);
}

function isMode(value: string | null | undefined): value is UiMode {
  return typeof value === "string" && (UI_MODE_IDS as readonly string[]).includes(value);
}

export function resolveStoredTheme(value: string | null | undefined): UiThemeId {
  return isTheme(value) ? value : DEFAULT_UI_THEME;
}

export function resolveStoredMode(value: string | null | undefined): UiMode {
  return isMode(value) ? value : DEFAULT_UI_MODE;
}

export function resolveEffectiveMode(mode: UiMode, prefersDark: boolean): EffectiveUiMode {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }

  return mode;
}

export function applyThemeToRoot(root: HTMLElement, themeId: UiThemeId): void {
  root.dataset.theme = themeId;
}

export function applyModeToRoot(root: HTMLElement, effectiveMode: EffectiveUiMode): void {
  root.classList.toggle("dark", effectiveMode === "dark");
  root.style.colorScheme = effectiveMode;
}

export function applyPreferencesToRoot(
  root: HTMLElement,
  preference: ThemePreference,
  prefersDark: boolean
): void {
  applyThemeToRoot(root, preference.theme);
  applyModeToRoot(root, resolveEffectiveMode(preference.mode, prefersDark));
}

export function readPreferencesFromStorage(storage: StorageLike): ThemePreference {
  return {
    theme: resolveStoredTheme(readStorage(storage, UI_THEME_STORAGE_KEY)),
    mode: resolveStoredMode(readStorage(storage, UI_MODE_STORAGE_KEY))
  };
}

export function persistPreferences(storage: StorageLike, preference: ThemePreference): void {
  writeStorage(storage, UI_THEME_STORAGE_KEY, preference.theme);
  writeStorage(storage, UI_MODE_STORAGE_KEY, preference.mode);
}

export function createThemeBootstrapScript(): string {
  return `(() => {
  const root = document.documentElement;
  const themeKey = ${JSON.stringify(UI_THEME_STORAGE_KEY)};
  const modeKey = ${JSON.stringify(UI_MODE_STORAGE_KEY)};

  const themeCandidates = ${JSON.stringify(UI_THEME_IDS)};
  const modeCandidates = ${JSON.stringify(UI_MODE_IDS)};

  const resolveTheme = (value) =>
    themeCandidates.includes(value) ? value : ${JSON.stringify(DEFAULT_UI_THEME)};

  const resolveMode = (value) =>
    modeCandidates.includes(value) ? value : ${JSON.stringify(DEFAULT_UI_MODE)};

  const readStorage = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const writeStorage = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore write failures.
    }
  };

  const mode = resolveMode(readStorage(modeKey));
  const theme = resolveTheme(readStorage(themeKey));

  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const effectiveMode = mode === "system" ? (prefersDark ? "dark" : "light") : mode;

  root.dataset.theme = theme;
  root.classList.toggle("dark", effectiveMode === "dark");
  root.style.colorScheme = effectiveMode;
})();`;
}
