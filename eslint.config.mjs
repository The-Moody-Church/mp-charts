import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
  {
    // Honor the `_`-prefix convention for intentionally unused vars/args.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // cache-handler.js is a CommonJS module loaded by Next.js (next.config.ts →
    // cacheHandlers.default), so require() is required here.
    files: ["cache-handler.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // React Compiler rules introduced by eslint-plugin-react-hooks 7.1 (pulled in
    // with eslint-config-next 16.3.0). They flag 19 PRE-EXISTING patterns — no new
    // code triggered them — dominated by the "load data in useEffect, then setState"
    // shape used across 14 processing/admin components.
    //
    // `set-state-in-effect` stays "warn" while the remaining sites are migrated
    // component-by-component; it flips back to "error" when the last one lands.
    // Tracked in docs/ideas.md ("Adopt React Compiler lint rules").
    //
    // `immutability` is NOT downgraded — its single violation
    // (contact-lookup-search.tsx) is fixed, so the rule is back at its default
    // "error" from eslint-config-next and now guards against regressions.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
