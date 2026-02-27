import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_PATHS = [
  "apps/web/components.json",
  "apps/web/tailwind.config.ts",
  "apps/web/postcss.config.mjs",
  "apps/web/app/app.css",
  "apps/web/app/lib/theme/theme.ts",
  "apps/web/app/features/chat/agent-types.ts",
  "apps/web/app/features/chat/agent-client.ts",
  "apps/web/app/features/chat/agent-event-store.ts",
  "apps/web/app/features/chat/agent-event-normalizer.ts",
  "apps/web/app/features/chat/agent-transport.ts",
  "apps/web/app/features/chat/new-thread-routing.ts",
  "apps/web/app/features/chat/presentation/chat-canvas.tsx",
  "apps/web/app/features/chat/presentation/chat-composer-footer.tsx",
  "apps/web/app/features/chat/presentation/chat-inspect-drawer.tsx",
  "apps/web/app/features/chat/presentation/chat-runtime-store.ts",
  "apps/web/app/features/settings/types.ts",
  "apps/web/app/features/settings/settings-modal-state.ts",
  "apps/web/app/components/ui/alert-dialog.tsx",
  "apps/web/app/components/ui/dialog.tsx",
  "apps/web/app/components/ui/tabs.tsx",
  "apps/web/app/components/ui/sidebar.tsx",
  "apps/web/app/components/shell/app-sidebar.tsx",
  "apps/web/app/components/shell/chat-thread-rail.tsx",
  "apps/web/app/components/shell/settings-modal.tsx",
  "apps/web/app/components/shell/theme-controls.tsx",
  "apps/web/app/routes.ts",
  "apps/web/app/routes/root-redirect/route.tsx",
  "apps/web/app/routes/public/login/route.tsx",
  "apps/web/app/routes/app/layout/route.tsx",
  "apps/web/app/routes/app/automations/route.tsx",
  "apps/web/app/routes/app/skills/route.tsx",
  "apps/web/app/routes/app/workspaces/route.tsx",
  "apps/web/app/routes/app/chat/route.tsx"
];

const LEGACY_PATHS = [
  "apps/web/app/styles",
  "apps/web/app/ui",
  "apps/web/app/shell",
  "apps/web/app/lib/ui",
  "apps/web/app/lib/workspace",
  "apps/web/app/styles/globals.css",
  "apps/web/app/routes/public.home",
  "apps/web/app/routes/public.login",
  "apps/web/app/routes/app.root",
  "apps/web/app/routes/app.workspaces",
  "apps/web/app/routes/app.t.$tenantSlug.chat",
  "apps/web/app/components/shell/sidebar.tsx",
  "apps/web/app/components/shell/profile-menu.tsx",
  "apps/web/app/components/shell/theme-studio.tsx"
];

const FORBIDDEN_LIBRARY_IMPORT_PATTERNS = [/from\s+["']@mui\//u, /from\s+["']antd["']/u];

function listTypescriptFiles(dirPath) {
  const entries = readdirSync(dirPath, {
    withFileTypes: true
  });

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypescriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }

  return files;
}

function isAllowedRouteImport(specifier) {
  if (!specifier.startsWith("~/")) {
    return true;
  }

  return (
    specifier.startsWith("~/features/") ||
    specifier.startsWith("~/components/") ||
    specifier.startsWith("~/lib/")
  );
}

function validateComponentsConfig(cwd, violations) {
  const componentsConfigPath = path.join(cwd, "apps/web/components.json");
  if (!existsSync(componentsConfigPath)) {
    return;
  }

  try {
    const config = JSON.parse(readFileSync(componentsConfigPath, "utf8"));
    if (config?.tailwind?.cssVariables !== true) {
      violations.push("components.json must set tailwind.cssVariables to true.");
    }

    if (config?.tailwind?.css !== "app/app.css") {
      violations.push("components.json tailwind.css must be set to app/app.css.");
    }

    if (config?.aliases?.ui !== "~/components/ui") {
      violations.push("components.json alias 'ui' must point to ~/components/ui.");
    }

    if (config?.aliases?.utils !== "~/lib/utils/cn") {
      violations.push("components.json alias 'utils' must point to ~/lib/utils/cn.");
    }
  } catch {
    violations.push("apps/web/components.json is not valid JSON.");
  }
}

function validateGlobalCss(cwd, violations) {
  const cssPath = path.join(cwd, "apps/web/app/app.css");
  if (!existsSync(cssPath)) {
    return;
  }

  const css = readFileSync(cssPath, "utf8");
  if (!css.includes("--background") || !css.includes(".dark")) {
    violations.push(
      "Global CSS tokens are incomplete. Expected token variables and a `.dark` selector in apps/web/app/app.css."
    );
  }

  if (!css.includes(':root[data-theme="')) {
    violations.push(
      "Global CSS must define token overrides for at least one data-theme selector in apps/web/app/app.css."
    );
  }

  if (
    !css.includes("--compass-chat-max-width") ||
    !css.includes("--aui-thread-max-width: var(--compass-chat-max-width)")
  ) {
    violations.push(
      "Global CSS must define a canonical centered chat width contract via --compass-chat-max-width and map --aui-thread-max-width to it."
    );
  }

  if (!css.includes("scrollbar-gutter: stable both-edges")) {
    violations.push(
      "Global CSS must stabilize chat timeline centering with scrollbar-gutter: stable both-edges."
    );
  }
}

function validateRootThemeBootstrap(cwd, violations) {
  const rootPath = path.join(cwd, "apps/web/app/root.tsx");
  const themeModulePath = path.join(cwd, "apps/web/app/lib/theme/theme.ts");
  if (!existsSync(rootPath) || !existsSync(themeModulePath)) {
    return;
  }

  const rootSource = readFileSync(rootPath, "utf8");
  const themeSource = readFileSync(themeModulePath, "utf8");

  if (!rootSource.includes("createThemeBootstrapScript")) {
    violations.push(
      "root.tsx must wire a pre-hydration theme bootstrap script via createThemeBootstrapScript()."
    );
  }

  if (!themeSource.includes("root.dataset.theme")) {
    violations.push(
      "Theme bootstrap must set document.documentElement.dataset.theme before hydration."
    );
  }

  if (!/classList\.toggle\(\s*["']dark["']/u.test(themeSource)) {
    violations.push("Theme bootstrap must toggle the html .dark class before hydration.");
  }
}

function validateSettingsCutover(cwd, violations) {
  const sidebarPath = path.join(cwd, "apps/web/app/components/shell/app-sidebar.tsx");
  const shellPath = path.join(cwd, "apps/web/app/components/shell/app-shell.tsx");

  if (existsSync(sidebarPath)) {
    const sidebarSource = readFileSync(sidebarPath, "utf8");
    if (sidebarSource.includes("ThemeStudio")) {
      violations.push(
        "app-sidebar.tsx must not import or render ThemeStudio after settings cutover."
      );
    }

    if (
      !sidebarSource.includes('buildSettingsHref("general")') ||
      !sidebarSource.includes('buildSettingsHref("personalization")')
    ) {
      violations.push(
        "app-sidebar.tsx must expose profile menu entries that open URL-backed settings modal state."
      );
    }

    if (
      sidebarSource.includes("WorkspaceSwitcher") ||
      sidebarSource.includes("Manage workspaces")
    ) {
      violations.push(
        "app-sidebar.tsx profile launcher must be action-only and must not include workspace rows or manage links."
      );
    }

    if (!sidebarSource.includes("AlertDialog")) {
      violations.push(
        "app-sidebar.tsx must require an AlertDialog confirmation before submitting logout."
      );
    }

    if (
      !sidebarSource.includes('"New thread"') ||
      !sidebarSource.includes('"Automations"') ||
      !sidebarSource.includes('"Skills"')
    ) {
      violations.push(
        "app-sidebar.tsx must include New thread, Automations, and Skills in the top utility cluster."
      );
    }

    if (!sidebarSource.includes("buildNewThreadHref")) {
      violations.push(
        "app-sidebar.tsx must build New thread navigation using buildNewThreadHref()."
      );
    }

    if (
      !sidebarSource.includes('action="/workspaces"') ||
      !sidebarSource.includes('name="intent" type="hidden" value="logout"')
    ) {
      violations.push(
        "app-sidebar.tsx logout confirmation must submit intent=logout to /workspaces."
      );
    }
  }

  if (existsSync(shellPath)) {
    const shellSource = readFileSync(shellPath, "utf8");
    if (!shellSource.includes("SettingsModal")) {
      violations.push("app-shell.tsx must render SettingsModal as part of the persistent shell.");
    }
  }
}

function validateRouteMap(cwd, violations) {
  const routesPath = path.join(cwd, "apps/web/app/routes.ts");
  if (!existsSync(routesPath)) {
    return;
  }

  const source = readFileSync(routesPath, "utf8");
  if (!source.includes('route("chat/:threadId?", "routes/app/chat/route.tsx")')) {
    violations.push(
      'routes.ts must register optional-thread chat route via route("chat/:threadId?", "routes/app/chat/route.tsx").'
    );
  }

  if (source.includes('route("t/:tenantSlug/chat"')) {
    violations.push("routes.ts must not register legacy /t/:tenantSlug/chat route.");
  }
}

function validateChatExperienceCutover(cwd, violations) {
  const chatRoutePath = path.join(cwd, "apps/web/app/routes/app/chat/route.tsx");
  const transportPath = path.join(cwd, "apps/web/app/features/chat/agent-transport.ts");
  const chatCanvasPath = path.join(cwd, "apps/web/app/features/chat/presentation/chat-canvas.tsx");
  const chatThreadRailPath = path.join(cwd, "apps/web/app/components/shell/chat-thread-rail.tsx");
  const runtimeStorePath = path.join(
    cwd,
    "apps/web/app/features/chat/presentation/chat-runtime-store.ts"
  );
  const chatContextPath = path.join(cwd, "apps/web/app/features/chat/chat-context.ts");

  if (
    !existsSync(chatRoutePath) ||
    !existsSync(transportPath) ||
    !existsSync(chatCanvasPath) ||
    !existsSync(chatThreadRailPath) ||
    !existsSync(runtimeStorePath) ||
    !existsSync(chatContextPath)
  ) {
    return;
  }

  const chatRouteSource = readFileSync(chatRoutePath, "utf8");
  const transportSource = readFileSync(transportPath, "utf8");
  const chatCanvasSource = readFileSync(chatCanvasPath, "utf8");
  const chatThreadRailSource = readFileSync(chatThreadRailPath, "utf8");
  const runtimeStoreSource = readFileSync(runtimeStorePath, "utf8");
  const chatContextSource = readFileSync(chatContextPath, "utf8");

  if (!chatRouteSource.includes("startAgentTransport")) {
    violations.push("chat route must use startAgentTransport() for live thread streaming.");
  }

  if (!chatRouteSource.includes("normalizeAgentEvents")) {
    violations.push("chat route must normalize backend agent events before rendering timeline.");
  }

  if (!chatRouteSource.includes("ChatCanvas")) {
    violations.push("chat route must delegate timeline/composer rendering to ChatCanvas.");
  }

  if (!chatRouteSource.includes('shellLayout: "immersive"')) {
    violations.push("chat route handle must request immersive shell layout.");
  }

  if (chatRouteSource.includes("<header")) {
    violations.push("chat route must not render top header chrome.");
  }

  if (chatRouteSource.includes("max-w-[1100px]") || chatRouteSource.includes("rounded-2xl")) {
    violations.push("chat route must not render boxed card framing around the chat timeline.");
  }

  if (!chatCanvasSource.includes("Thread")) {
    violations.push("chat canvas must render assistant-ui Thread primitive.");
  }

  if (!chatThreadRailSource.includes("ThreadList")) {
    violations.push("chat thread rail must render assistant-ui ThreadList primitives.");
  }

  if (chatRouteSource.includes("TimelineMessage") || chatRouteSource.includes("ReactMarkdown")) {
    violations.push("chat route must not render legacy custom message bubble implementations.");
  }

  if (chatRouteSource.includes("Chat transport is intentionally staged")) {
    violations.push("chat route must not keep the staged placeholder response messaging.");
  }

  if (runtimeStoreSource.includes("__compass_event__:")) {
    violations.push(
      "chat runtime store must not encode event metadata into message text prefixes."
    );
  }

  if (!transportSource.includes("/v1/agent/threads/") || !transportSource.includes("/stream")) {
    violations.push("agent transport must target /v1/agent/threads/:threadId/stream.");
  }

  if (chatContextSource.includes('return "personal"')) {
    violations.push(
      "chat context resolution must not hardcode a personal tenant slug fallback. Resolve from /v1/auth/me memberships only."
    );
  }
}

function validateRouteFiles(cwd, violations) {
  const routesDir = path.join(cwd, "apps/web/app/routes");
  if (!existsSync(routesDir)) {
    return;
  }

  const routeFiles = listTypescriptFiles(routesDir);

  for (const filePath of routeFiles) {
    const normalizedPath = path.relative(cwd, filePath);
    const source = readFileSync(filePath, "utf8");

    if (path.basename(filePath) !== "route.tsx") {
      violations.push(
        `${normalizedPath} is not allowed. Route directories must expose a single route.tsx entrypoint.`
      );
    }

    if (
      /\bexport\s+async\s+function\s+loader\b/u.test(source) ||
      /\bexport\s+async\s+function\s+action\b/u.test(source)
    ) {
      violations.push(
        `${normalizedPath} exports loader/action. In ssr:false SPA mode, route modules must export clientLoader/clientAction.`
      );
    }

    if (/\bfetch\s*\(/u.test(source)) {
      violations.push(
        `${normalizedPath} uses raw fetch(). Route modules must use @compass/sdk helpers.`
      );
    }

    const importMatches = source.matchAll(/from\s+["']([^"']+)["']/gu);
    for (const match of importMatches) {
      const specifier = match[1] ?? "";

      if (specifier.startsWith("../")) {
        violations.push(
          `${normalizedPath} imports '${specifier}'. Route modules must not use parent-relative imports.`
        );
      }

      if (specifier.startsWith("~/routes/")) {
        violations.push(
          `${normalizedPath} imports '${specifier}'. Route modules must not import other route modules.`
        );
      }

      if (!isAllowedRouteImport(specifier)) {
        violations.push(
          `${normalizedPath} imports '${specifier}'. Route modules may import only ~/features, ~/components, or ~/lib.`
        );
      }
    }

    for (const forbiddenPattern of FORBIDDEN_LIBRARY_IMPORT_PATTERNS) {
      if (forbiddenPattern.test(source)) {
        violations.push(
          `${normalizedPath} imports a forbidden component framework. Use shadcn/Radix primitives.`
        );
      }
    }
  }
}

export function runWebConstitutionCheck({ cwd = process.cwd(), logger = console } = {}) {
  const violations = [];

  for (const requiredPath of REQUIRED_PATHS) {
    const absolutePath = path.join(cwd, requiredPath);
    if (!existsSync(absolutePath)) {
      violations.push(`Missing required frontend constitution file: ${requiredPath}`);
    }
  }

  for (const legacyPath of LEGACY_PATHS) {
    const absolutePath = path.join(cwd, legacyPath);
    if (existsSync(absolutePath)) {
      violations.push(`Legacy frontend path must be removed for v2 cutover: ${legacyPath}`);
    }
  }

  validateGlobalCss(cwd, violations);
  validateRootThemeBootstrap(cwd, violations);
  validateSettingsCutover(cwd, violations);
  validateRouteMap(cwd, violations);
  validateChatExperienceCutover(cwd, violations);
  validateComponentsConfig(cwd, violations);
  validateRouteFiles(cwd, violations);

  if (violations.length === 0) {
    logger.info("Web constitution policy passed (WEB000).");
    return {
      status: "pass",
      reasonCode: "WEB000"
    };
  }

  logger.error("WEB001 frontend constitution violations detected");
  for (const violation of violations) {
    logger.error(`- ${violation}`);
  }
  logger.error(
    "Fix: align route/module boundaries and UI stack with docs/architecture/frontend-constitution.md"
  );

  return {
    status: "fail",
    reasonCode: "WEB001",
    violations
  };
}

export async function main({ logger = console } = {}) {
  try {
    const result = runWebConstitutionCheck({ logger });
    if (result.status === "fail") {
      process.exitCode = 1;
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void main();
}
