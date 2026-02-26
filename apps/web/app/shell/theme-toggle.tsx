import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/ui/shadcn/button";

const THEME_STORAGE_KEY = "compass-theme";

type Theme = "light" | "dark";

function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const persisted = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (persisted === "light" || persisted === "dark") {
    return persisted;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
}

export const __private__ = {
  THEME_STORAGE_KEY,
  resolveInitialTheme,
  applyTheme
};
