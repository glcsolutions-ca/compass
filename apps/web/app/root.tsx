import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "./styles/globals.css";

const THEME_SCRIPT = `(() => {
  const key = "compass-theme";
  const root = document.documentElement;
  const persisted = window.localStorage.getItem(key);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = persisted === "light" || persisted === "dark" ? persisted : (systemDark ? "dark" : "light");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
})();`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
