import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-types/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/vitest*.config.*",
      "apps/web/next-env.d.ts",
      "packages/testkit/guardrails/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
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
      "no-restricted-syntax": [
        "error",
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
      ]
    }
  },
  {
    files: [
      "apps/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.tsx",
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx"
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/*", "@compass/*/src/*", "@compass/*/dist/*"],
          paths: [
            {
              name: "pg",
              message:
                "Commit-stage tests must not import pg directly. Move DB coverage to integration tests."
            },
            {
              name: "@prisma/client",
              message:
                "Commit-stage tests must not import prisma clients directly. Move DB coverage to integration tests."
            },
            {
              name: "mysql2",
              message:
                "Commit-stage tests must not import DB clients directly. Move DB coverage to integration tests."
            },
            {
              name: "mongodb",
              message:
                "Commit-stage tests must not import DB clients directly. Move DB coverage to integration tests."
            },
            {
              name: "redis",
              message:
                "Commit-stage tests must not import DB/queue clients directly. Mock the boundary or use integration tests."
            },
            {
              name: "ioredis",
              message:
                "Commit-stage tests must not import DB/queue clients directly. Mock the boundary or use integration tests."
            },
            {
              name: "child_process",
              message:
                "Commit-stage tests must run in-process. Avoid child_process usage in this layer."
            },
            {
              name: "node:child_process",
              message:
                "Commit-stage tests must run in-process. Avoid child_process usage in this layer."
            }
          ]
        }
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            "Commit-stage tests must be deterministic. Avoid Math.random() or inject a seeded RNG."
        },
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
        },
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
      ]
    }
  },
  {
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin
    },
    settings: {
      next: {
        rootDir: "apps/web"
      }
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-html-link-for-pages": "off"
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
