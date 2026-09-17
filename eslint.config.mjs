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
    // React Compiler rules from eslint-plugin-react-hooks 7.1 (pulled in with
    // eslint-config-next 16.3.0). They flagged 20 PRE-EXISTING patterns — no new
    // code triggered them — dominated by the "load data in useEffect, then
    // setState" shape used across 14 processing/admin components. All 20 are fixed
    // (2026-08-07 → 2026-08-12); see .claude/notes/react-compiler-lint-plan.md.
    //
    // All three are now "error". `set-state-in-effect` was the last to flip, once
    // user-context landed.
    //
    // NOTE for anyone hitting one of these: the rule does NOT descend into nested
    // function expressions, so wrapping an effect body in an async IIFE silences it
    // with the pattern intact. That is not a fix. The four recipes that came out of
    // this migration are in the plan note — the short version is that a setState
    // reachable before the first `await` belongs either in an async continuation, in
    // an event handler, in a `useState` initialiser, or in a value derived during
    // render.
    //
    // `incompatible-library` is pinned to "error" rather than left at its
    // Recommended-preset "warn" so a future useForm().watch() or a similarly
    // uncompilable library call fails CI instead of silently opting a component
    // out of React Compiler optimisation. `immutability` is already "error" in the
    // preset; it is listed anyway so all three severities are visible in one place.
    rules: {
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/immutability": "error",
      "react-hooks/incompatible-library": "error",
    },
  },
  // F5 — member PII and pastoral notes must never reach info-level logs.
  // Hosting and log-aggregation platforms retain console output with broader
  // access and longer retention than the Ministry Platform database itself.
  // `warn`/`error` stay allowed, but they must log identifiers and shape only
  // (see .claude/rules/security.md). Generator scripts and tests are exempt.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/providers/ministry-platform/scripts/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  // Operational lifecycle logging (startup, cache warming, send audit) is
  // deliberately kept and deliberately `info`, not `warn` — it is not a
  // problem, and routing it through warn would pollute alerting. These files
  // carry identifiers and counts only, never record content.
  {
    files: [
      "src/instrumentation.ts",
      "src/app/api/cache-warm/route.ts",
    ],
    rules: {
      "no-console": ["error", { allow: ["info", "warn", "error"] }],
    },
  },
]);

export default eslintConfig;
