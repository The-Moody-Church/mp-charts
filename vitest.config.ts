import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // scripts/ holds the CI audit gate's tests (scripts/audit-gate-lib.test.ts).
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // #212: without `include`, v8 coverage counts only the files a test happens
      // to import, so a file with no test at all never enters the denominator and
      // the percentage overstates real coverage. List the source explicitly.
      include: ['src/**/*.{ts,tsx}', 'scripts/audit-gate-lib.mjs', 'scripts/standalone-check-lib.mjs'],
      // Floors at the measured totals (2026-11-17 after #304-#306 and the audit-gate merge: 59.44 / 50.32 / 50.60 / 60.66),
      // so `npm run test:coverage` fails if coverage drops. Raise them as tests land.
      thresholds: { statements: 59, branches: 50, functions: 50, lines: 60 },
      // Explicit `/**` globs: since Vitest 5 these match paths relative to the
      // root, and a bare `models/` no longer excluded the generated models.
      exclude: [
        'node_modules/**',
        '.next/**',
        'src/test-setup.ts',
        '**/*.d.ts',
        'src/lib/providers/ministry-platform/models/**', // Auto-generated files
        'src/lib/providers/ministry-platform/scripts/**', // mp:generate:models CLI, not app code
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
