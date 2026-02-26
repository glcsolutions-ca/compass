import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_PATHS = [
  "apps/web/components.json",
  "apps/web/tailwind.config.ts",
  "apps/web/postcss.config.mjs",
  "apps/web/app/app.css",
  "apps/web/app/components/ui/sidebar.tsx",
  "apps/web/app/components/shell/app-sidebar.tsx",
  "apps/web/app/routes.ts",
  "apps/web/app/routes/root-redirect/route.tsx",
  "apps/web/app/routes/public/login/route.tsx",
  "apps/web/app/routes/app/layout/route.tsx",
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
  "apps/web/app/components/shell/profile-menu.tsx"
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
