import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import {
  applyModeToRoot,
  applyThemeToRoot,
  DEFAULT_UI_MODE,
  DEFAULT_UI_THEME,
  persistPreferences,
  readPreferencesFromStorage,
  resolveEffectiveMode,
  UI_MODE_OPTIONS,
  UI_THEME_OPTIONS,
  type ThemePreference,
  type UiMode,
  type UiThemeId
} from "~/lib/theme/theme";
import { cn } from "~/lib/utils/cn";

function readSystemPreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readInitialPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return {
      theme: DEFAULT_UI_THEME,
      mode: DEFAULT_UI_MODE
    };
  }

  return readPreferencesFromStorage(window.localStorage);
}

const modeIcons: Record<UiMode, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon
};

export function ThemeControls() {
  const [preference, setPreference] = useState<ThemePreference>(() => readInitialPreference());
  const [previewTheme, setPreviewTheme] = useState<UiThemeId | null>(null);
  const [prefersDark, setPrefersDark] = useState<boolean>(() => readSystemPreference());
  const committedThemeRef = useRef(preference.theme);

  const effectiveTheme = previewTheme ?? preference.theme;
  const effectiveMode = useMemo(
    () => resolveEffectiveMode(preference.mode, prefersDark),
    [preference.mode, prefersDark]
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    applyThemeToRoot(document.documentElement, effectiveTheme);
  }, [effectiveTheme]);

  useEffect(() => {
    committedThemeRef.current = preference.theme;
  }, [preference.theme]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    applyModeToRoot(document.documentElement, effectiveMode);
  }, [effectiveMode]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (event: MediaQueryListEvent) => {
      if (preference.mode === "system") {
        setPrefersDark(event.matches);
      }
    };

    setPrefersDark(mediaQuery.matches);

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [preference.mode]);

  useEffect(() => {
    return () => {
      if (typeof document === "undefined") {
        return;
      }

      applyThemeToRoot(document.documentElement, committedThemeRef.current);
    };
  }, []);

  const updatePreference = (updater: (current: ThemePreference) => ThemePreference) => {
    setPreference((current) => {
      const next = updater(current);
      if (typeof window !== "undefined") {
        persistPreferences(window.localStorage, next);
      }
      return next;
    });
  };

  const handleModeChange = (mode: UiMode) => {
    updatePreference((current) => ({
      ...current,
      mode
    }));
  };

  const handleThemeCommit = (theme: UiThemeId) => {
    setPreviewTheme(null);
    updatePreference((current) => ({
      ...current,
      theme
    }));
  };

  const clearPreview = () => {
    setPreviewTheme(null);
  };

  return (
    <section
      aria-label="Appearance settings"
      className="space-y-6"
      onBlurCapture={(event) => {
        const relatedTarget = event.relatedTarget;
        if (!event.currentTarget.contains(relatedTarget as Node | null)) {
          clearPreview();
        }
      }}
      onPointerLeave={clearPreview}
    >
      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-tight text-foreground">Appearance</h3>
        <p className="text-sm text-muted-foreground">
          Pick a display mode and theme palette for your account.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Mode
        </p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Display mode">
          {UI_MODE_OPTIONS.map((option) => {
            const ModeIcon = modeIcons[option.id];
            const selected = preference.mode === option.id;

            return (
              <Button
                key={option.id}
                aria-checked={selected}
                aria-label={`${option.label} mode`}
                className={cn(
                  "justify-start gap-2 rounded-lg border text-sm",
                  selected
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border/80 bg-background"
                )}
                onClick={() => {
                  handleModeChange(option.id);
                }}
                role="radio"
                size="sm"
                type="button"
                variant="ghost"
              >
                <ModeIcon className="h-4 w-4 text-muted-foreground" />
                <span>{option.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Theme
        </p>
        <TooltipProvider delayDuration={100}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {UI_THEME_OPTIONS.map((option) => {
              const selected = option.id === preference.theme;

              return (
                <Tooltip key={option.id}>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={`${option.label} theme`}
                      aria-pressed={selected}
                      className={cn(
                        "h-auto flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors duration-150",
                        selected
                          ? "border-primary bg-accent/70"
                          : "border-border/80 bg-background hover:bg-accent/60"
                      )}
                      onClick={() => {
                        handleThemeCommit(option.id);
                      }}
                      onFocus={() => {
                        setPreviewTheme(option.id);
                      }}
                      onMouseEnter={() => {
                        setPreviewTheme(option.id);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <span className="flex w-full items-center gap-1.5">
                        <span
                          aria-hidden
                          className="h-3 w-3 rounded-full border border-border/60"
                          style={{ backgroundColor: `hsl(${option.swatches.primary})` }}
                        />
                        <span
                          aria-hidden
                          className="h-3 w-3 rounded-full border border-border/60"
                          style={{ backgroundColor: `hsl(${option.swatches.accent})` }}
                        />
                        <span
                          aria-hidden
                          className="h-3 w-3 rounded-full border border-border/60"
                          style={{ backgroundColor: `hsl(${option.swatches.ring})` }}
                        />
                      </span>
                      <span className="flex w-full items-center gap-1 text-xs font-medium">
                        <span className="truncate">{option.label}</span>
                        {selected ? <Check className="ml-auto h-3.5 w-3.5 text-primary" /> : null}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{option.description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
        <p className="text-xs text-muted-foreground">
          Hover previews a theme. Click to lock it in.
        </p>
      </div>
    </section>
  );
}
