import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import { loadTestPolicySync } from "./scripts/pipeline/commit/testing-policy.mjs";

const testPolicy = loadTestPolicySync(process.env.TEST_POLICY_PATH?.trim() || undefined);
const lintPolicy = testPolicy.lint;
const commitStageGlobs = lintPolicy.commitStageGlobs;

function createFocusedTestSelectors() {
  return [
    {
      selector: "CallExpression[callee.object.name='it'][callee.property.name='only']",
      message: "Focused tests (it.only) are forbidden. Remove .only before commit."
    },
    {
      selector: "CallExpression[callee.object.name='test'][callee.property.name='only']",
      message: "Focused tests (test.only) are forbidden. Remove .only before commit."
    },
    {
      selector: "CallExpression[callee.object.name='describe'][callee.property.name='only']",
      message: "Focused tests (describe.only) are forbidden. Remove .only before commit."
    }
  ];
}

function dbImportMessage(moduleName) {
  if (moduleName === "pg") {
    return "Commit-stage tests must not import pg directly. Move DB coverage to integration tests.";
  }

  if (moduleName === "@prisma/client") {
    return "Commit-stage tests must not import prisma clients directly. Move DB coverage to integration tests.";
  }

  return "Commit-stage tests must not import DB clients directly. Move DB coverage to integration tests.";
}

const focusedTestSelectors = lintPolicy.focusedTests ? createFocusedTestSelectors() : [];
const commitStageSyntaxSelectors = [];

if (lintPolicy.disallowMathRandom) {
  commitStageSyntaxSelectors.push({
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: "Commit-stage tests must be deterministic. Avoid Math.random() or inject a seeded RNG."
  });
}

if (lintPolicy.disallowRawSetTimeout) {
  commitStageSyntaxSelectors.push(
    {
      selector: "CallExpression[callee.name='setTimeout']",
      message:
        "Raw setTimeout in commit-stage tests is disallowed. Poll a readiness condition or use testkit helpers."
    },
    {
      selector:
        "CallExpression[callee.object.name='globalThis'][callee.property.name='setTimeout']",
      message:
        "Raw setTimeout in commit-stage tests is disallowed. Poll a readiness condition or use testkit helpers."
    }
  );
}

if (lintPolicy.focusedTests) {
  commitStageSyntaxSelectors.push(...createFocusedTestSelectors());
}

const commitStageRestrictedImportPaths = [];
if (lintPolicy.disallowDbImports) {
  commitStageRestrictedImportPaths.push(
    ...lintPolicy.dbModules.map((moduleName) => ({
      name: moduleName,
      message: dbImportMessage(moduleName)
    }))
  );
}

if (lintPolicy.disallowChildProcessImports) {
  commitStageRestrictedImportPaths.push(
    {
      name: "child_process",
      message: "Commit-stage tests must run in-process. Avoid child_process usage in this layer."
    },
    {
      name: "node:child_process",
      message: "Commit-stage tests must run in-process. Avoid child_process usage in this layer."
    }
  );
}

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-types/**",
      "**/build/**",
      "**/.react-router/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/vitest*.config.*",
      "**/postcss.config.mjs",
      "packages/testkit/guardrails/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["tests/e2e/*.ts"]
        },
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "no-undef": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/*", "@compass/*/src/*", "@compass/*/dist/*"]
        }
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false
          }
        }
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "typeLike",
          format: ["PascalCase"]
        }
      ]
    }
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**/*.ts", "**/test/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      ...(focusedTestSelectors.length > 0
        ? {
            "no-restricted-syntax": ["error", ...focusedTestSelectors]
          }
        : {})
    }
  },
  {
    files: commitStageGlobs,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/*", "@compass/*/src/*", "@compass/*/dist/*"],
          paths: commitStageRestrictedImportPaths
        }
      ],
      ...(commitStageSyntaxSelectors.length > 0
        ? {
            "no-restricted-syntax": ["error", ...commitStageSyntaxSelectors]
          }
        : {})
    }
  },
  {
    files: ["apps/web/app/routes/**/*.ts", "apps/web/app/routes/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/*",
            "@compass/*/src/*",
            "@compass/*/dist/*",
            "../*",
            "../../*",
            "../../../*",
            "~/routes/*",
            "apps/web/app/routes/*"
          ]
        }
      ]
    }
  },
  {
    files: ["apps/web/app/features/auth/**/*.ts", "apps/web/app/features/auth/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["~/features/workspace/*", "~/features/chat/*"]
        }
      ]
    }
  },
  {
    files: ["apps/web/app/features/workspace/**/*.ts", "apps/web/app/features/workspace/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["~/features/chat/*"]
        }
      ]
    }
  },
  {
    files: ["apps/web/app/features/chat/**/*.ts", "apps/web/app/features/chat/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["~/features/workspace/*"]
        }
      ]
    }
  },
  {
    files: ["packages/sdk/src/generated/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/naming-convention": "off"
    }
  },
  eslintConfigPrettier
);
