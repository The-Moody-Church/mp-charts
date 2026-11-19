import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every MP client log line goes through errorForLog (batch 3). A raw Error in
 * console.error prints its message verbatim, so caller-shaped text with a newline
 * forges log lines, and the stack and cause come with it. A behavioural test per
 * method would pin only the methods it calls (the review found 17 of 20 sites
 * unpinned), so this pins the source instead: each log line is
 * `console.error(<fixed text>, errorForLog(error));`, and each service catch logs
 * one.
 */

const PROVIDER_DIR = join(process.cwd(), 'src/lib/providers/ministry-platform');
const SERVICES_DIR = join(PROVIDER_DIR, 'services');

const serviceFiles = readdirSync(SERVICES_DIR)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => join('services', name));
const scannedFiles = [...serviceFiles, 'client.ts'];

/** Comments removed, so a JSDoc example cannot satisfy or trip the scan. */
function source(file: string): string {
  return readFileSync(join(PROVIDER_DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Fixed text only: no template literal, interpolation or escape. */
const SAFE_LOG_LINE = /^console\.error\((['"])[^'"`$\\\n]*\1, errorForLog\(error\)\);$/;

function consoleCalls(text: string): string[] {
  return [...text.matchAll(/console\.\w+\([^\n]*/g)].map((m) => m[0].trim());
}

describe('MP client log sites', () => {
  it('finds the log sites it is meant to check', () => {
    const total = scannedFiles.reduce((n, file) => n + consoleCalls(source(file)).length, 0);
    // 20 in the services plus client.ts's token refresh, on 2026-11-19.
    expect(total).toBeGreaterThanOrEqual(21);
  });

  it.each(scannedFiles)('%s logs only fixed text plus errorForLog(error)', (file) => {
    for (const call of consoleCalls(source(file))) {
      expect(call, `${file}: ${call}`).toMatch(SAFE_LOG_LINE);
    }
  });

  it.each(serviceFiles.filter((file) => file.endsWith('.service.ts')))(
    '%s logs every caught error through errorForLog before rethrowing',
    (file) => {
      const text = source(file);
      const catches = [...text.matchAll(/catch \((\w+)\) \{\s*\n\s*([^\n]*)\n\s*([^\n]*)/g)];
      for (const [, name, first, second] of catches) {
        expect(name, file).toBe('error');
        expect(first, `${file}: ${first}`).toMatch(SAFE_LOG_LINE);
        expect(second, `${file}: ${second}`).toBe('throw error;');
      }
    }
  );

  it('rejects the patterns it is meant to catch', () => {
    for (const bad of [
      "console.error('Error fetching table records:', error);",
      'console.error(`Error fetching records from table ${table}:`, errorForLog(error));',
      "console.error('Error:', errorForLog(error), error);",
      "console.warn('Error:', error);",
    ]) {
      expect(bad).not.toMatch(SAFE_LOG_LINE);
    }
  });
});
