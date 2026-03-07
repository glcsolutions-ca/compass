import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";

const nodeGlobals = {
  console: "readonly",
  process: "readonly"
};

export default [
  {
    ignores: ["coverage/**", "dist/**", "dist-types/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["migrations/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: nodeGlobals
    }
  },
  eslintConfigPrettier
];
