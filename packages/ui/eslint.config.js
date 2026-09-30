// ESLint covers what Oxlint cannot read: Svelte markup and Svelte-specific rules.
// Oxlint runs first and owns JavaScript/TypeScript rules, including in <script>.
// Consumers re-export this config, and the parsers resolve here, beside this
// package's TypeScript 6 (typescript-eslint rejects 7).
import { plugin as shadcn } from "@shadcn/lint";
import tsParser from "@typescript-eslint/parser";
import oxlint from "eslint-plugin-oxlint";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import path from "node:path";

export default defineConfig([
  {
    files: ["src/**/*.{svelte,ts,js}"],
    extends: [svelte.configs.recommended],
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: "@moku/ui/ui",
        note: "Follow DESIGN.md; add a token or variant only when the design calls for one.",
      },
    },
    rules: {
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": "error",
      "shadcn/no-restyle": ["error", { allow: ["layout"] }],
      "shadcn/no-unknown-classes": "error",
    },
  },
  {
    files: ["src/**/*.{ts,js}"],
    ignores: ["src/**/*.svelte.{ts,js}"],
    languageOptions: { parser: tsParser },
  },
  {
    files: ["src/**/*.svelte", "src/**/*.svelte.{ts,js}"],
    languageOptions: { parserOptions: { parser: tsParser, extraFileExtensions: [".svelte"] } },
  },
  {
    // Primitives define the variants that consumers must use instead.
    files: ["src/ui/**"],
    rules: { "shadcn/no-restyle": "off", "shadcn/no-arbitrary-values": "off" },
  },
  // Keep last: turns off any ESLint rule that Oxlint already runs.
  ...oxlint.buildFromOxlintConfigFile(path.join(import.meta.dirname, "../../.oxlintrc.json")),
]);
