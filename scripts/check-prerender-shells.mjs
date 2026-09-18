#!/usr/bin/env node
/**
 * Fails the build if any prerendered shell still contains script tags.
 *
 * WHY THIS EXISTS
 *
 * A nonce-based Content-Security-Policy and Next's prerendered shells are
 * mutually exclusive. Next reads the nonce off the INCOMING REQUEST at render
 * time, so a shell built at `next build` has no request and its script tags
 * get no nonce. Under an enforced policy those scripts are blocked and the
 * page never hydrates.
 *
 * `src/app/layout.tsx` prevents this with `connection()` and
 * `export const instant = false`. This checks the RESULT rather than the
 * source, because the source test can pass while the outcome is still wrong —
 * a future Next upgrade, a route that opts back in, or a nested layout could
 * all reintroduce a shell without touching the root layout at all.
 *
 * The failure mode is silent: the app builds, renders and tests green either
 * way. It only breaks once CSP_ENFORCE is turned on, in production, on every
 * page at once. That is worth a build gate.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = ".next/server/app";

/**
 * `_global-error.html` legitimately keeps its scripts. React renders that
 * boundary OUTSIDE the root layout — it replaces <html> entirely — so the root
 * layout's opt-out cannot reach it. It appears only when the root layout
 * itself throws, and it degrades to un-hydrated static HTML rather than
 * breaking a working page.
 */
const ALLOWED = new Set(["_global-error.html"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

let shells;
try {
  shells = walk(APP_DIR);
} catch {
  console.error(`✗ ${APP_DIR} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const offenders = [];
for (const file of shells) {
  const rel = file.slice(APP_DIR.length + 1);
  if (ALLOWED.has(rel)) continue;
  const count = (readFileSync(file, "utf8").match(/<script/g) || []).length;
  if (count > 0) offenders.push({ rel, count });
}

if (offenders.length) {
  console.error("✗ Prerendered shells still contain script tags.\n");
  console.error("  Those scripts cannot carry a per-request CSP nonce, so they");
  console.error("  are blocked under an enforced policy and the page never");
  console.error("  hydrates. See src/app/layout.tsx.\n");
  for (const o of offenders) console.error(`    ${o.rel}  —  ${o.count} script tags`);
  process.exit(1);
}

console.log(`✓ ${shells.length} prerendered shells checked, none carry script tags` +
  ` (${ALLOWED.size} allowed exception).`);
