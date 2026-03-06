import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";

const nodeGlobals = {
  ArrayBuffer: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  __AGENT_SOURCE_FILE__: "readonly",
  __BOOT_ID__: "readonly",
  __CONNECT_TOKEN__: "readonly",
  __CONTROL_PLANE_URL__: "readonly",
  __ECHO_SOURCE_FILE__: "readonly",
  __FORCE_RESTART__: "readonly",
  __SESSION_IDENTIFIER__: "readonly",
  __WORK_DIR__: "readonly",
  __WS_VERSION__: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  process: "readonly",
  queueMicrotask: "readonly",
  require: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly"
};

export default [
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: nodeGlobals
    }
  },
  {
    files: ["src/**/*.test.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...nodeGlobals
      }
    }
  },
  eslintConfigPrettier
];
