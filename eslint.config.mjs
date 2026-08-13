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
    // `immutability` and `incompatible-library` are NOT downgraded — their
    // violations (contact-lookup-search.tsx and contact-logs.tsx) are fixed.
    // `incompatible-library` is pinned to "error" rather than left at its
    // Recommended-preset "warn" so a future useForm().watch() or a similarly
    // uncompilable library call fails CI instead of silently opting a component
    // out of React Compiler optimisation.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/incompatible-library": "error",
    },
  },
]);

export default eslintConfig;
