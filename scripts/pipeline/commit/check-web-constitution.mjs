import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_PATHS = [
  "apps/web/components.json",
  "apps/web/tailwind.config.ts",
  "apps/web/postcss.config.mjs",
  "apps/web/app/styles/globals.css",
  "apps/web/app/routes/public.login/route.tsx",
  "apps/web/app/routes/app.root/route.tsx",
  "apps/web/app/routes/app.workspaces/route.tsx",
  "apps/web/app/routes/app.t.$tenantSlug.chat/route.tsx"
];

const FORBIDDEN_LIBRARY_IMPORT_PATTERNS = [/from\s+["']@mui\//u, /from\s+["']antd["']/u];

function listRouteFiles(dirPath) {
  const entries = readdirSync(dirPath, {
    withFileTypes: true
  });

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRouteFiles(fullPath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }

  return files;
}

export function runWebConstitutionCheck({ cwd = process.cwd(), logger = console } = {}) {
  const violations = [];

  for (const requiredPath of REQUIRED_PATHS) {
    const absolutePath = path.join(cwd, requiredPath);
    if (!existsSync(absolutePath)) {
      violations.push(`Missing required frontend constitution file: ${requiredPath}`);
    }
  }

  const globalsPath = path.join(cwd, "apps/web/app/styles/globals.css");
  if (existsSync(globalsPath)) {
    const globals = readFileSync(globalsPath, "utf8");
    if (!globals.includes("--background") || !globals.includes(".dark")) {
      violations.push(
        "Global CSS tokens are incomplete. Expected token variables and a `.dark` selector in apps/web/app/styles/globals.css."
      );
    }
  }

  const componentsConfigPath = path.join(cwd, "apps/web/components.json");
  if (existsSync(componentsConfigPath)) {
    try {
      const componentsConfig = JSON.parse(readFileSync(componentsConfigPath, "utf8"));
      if (componentsConfig?.tailwind?.cssVariables !== true) {
        violations.push("components.json must set tailwind.cssVariables to true.");
      }
    } catch {
      violations.push("apps/web/components.json is not valid JSON.");
    }
  }

  const routesDirectory = path.join(cwd, "apps/web/app/routes");
  if (existsSync(routesDirectory)) {
    const routeFiles = listRouteFiles(routesDirectory);

    for (const filePath of routeFiles) {
      const source = readFileSync(filePath, "utf8");
      const normalizedPath = path.relative(cwd, filePath);

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
            `${normalizedPath} imports '${specifier}'. Route modules must not cross-import using parent-relative paths.`
          );
        }

        if (specifier.startsWith("~/routes/")) {
          violations.push(
            `${normalizedPath} imports '${specifier}'. Route modules must not import other route capsules.`
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
