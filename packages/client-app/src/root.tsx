import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "@assistant-ui/react-ui/styles/index.css";
import "./app.css";
import { createThemeBootstrapScript } from "~/lib/theme/theme";

const THEME_BOOTSTRAP_SCRIPT = createThemeBootstrapScript();

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
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
