import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "allnoodles-app/**",
    ".codex/**",
    "scratch/**",
    "fix-revalidate.js",
    "fix-revalidate-back.js",
    "lint_output.txt",
    "fix-unit.sql",
    // Generated browser fixture code; its source render script is linted normally.
    "output/reserve-history/*bundle.js",
    "output/reserve-history/*.cjs",
    "output/order-entry/*bundle.js",
    "output/order-entry/*.cjs",
  ]),
]);

export default eslintConfig;
