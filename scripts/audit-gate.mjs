#!/usr/bin/env node
// @ts-check
/**
 * npm audit deploy gate — CI's "Audit npm dependencies" step (the `verify`
 * job of docker-build-push.yml and the nightly audit-nightly.yml).
 *
 * Same rule as the `npm audit --audit-level=high` it replaces — any HIGH or
 * CRITICAL vulnerability fails — except advisories listed in
 * scripts/audit-allowlist.json, and only when EVERY root advisory behind a
 * vulnerability is listed. Allow-list entries are dev-only exceptions: while
 * one is in use, a second audit of the production tree (`--omit=dev`) fails
 * the gate if an allow-listed advisory appears there. The decision logic and
 * its tests live in scripts/audit-gate-lib.mjs / scripts/audit-gate-lib.test.ts.
 *
 *   node scripts/audit-gate.mjs
 *
 * Exit 0: nothing HIGH/CRITICAL outside the allow-list, and no allow-listed
 *         advisory in the production tree.
 * Exit 1: at least one violation (printed as ::error::).
 * Exit 2: could not verify — the audit endpoint still failing after 3
 *         attempts, npm output that is not a valid report, or an invalid
 *         allow-list. Never a pass.
 *
 * Needs no installed dependencies: plain node + the npm on PATH. Audits the
 * repository this file lives in, whatever the working directory.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { EXIT_UNVERIFIED, annotation, runGate, todayUtc } from "./audit-gate-lib.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const allowlistPath = fileURLToPath(new URL("./audit-allowlist.json", import.meta.url));

/**
 * Runs `npm <args>` once; the gate passes NPM_AUDIT_ARGS or NPM_AUDIT_PROD_ARGS.
 * @param {readonly string[]} args
 * @returns {import("./audit-gate-lib.mjs").AuditRun}
 */
function runAudit(args) {
  const result = spawnSync("npm", [...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    // npm is npm.cmd on Windows; CI is Linux, but keep local runs working.
    shell: process.platform === "win32",
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error ?? null,
  };
}

/** @param {string} line */
function print(line) {
  process.stdout.write(`${line}\n`);
}

let allowlist;
try {
  allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
} catch (error) {
  print(
    annotation(
      "error",
      `could not read scripts/audit-allowlist.json: ${/** @type {Error} */ (error).message} — could not verify advisories.`,
    ),
  );
  process.exit(EXIT_UNVERIFIED);
}

process.exitCode = await runGate({
  runAudit,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  print,
  allowlist,
  today: todayUtc(),
});
