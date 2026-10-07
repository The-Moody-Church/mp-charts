// @ts-check
/**
 * Decision logic for the npm audit deploy gate (`scripts/audit-gate.mjs`).
 *
 * WHY THIS EXISTS
 *
 * CI used to run `npm audit --audit-level=high`, which fails on ANY high or
 * critical vulnerability and has no way to except one. On 2026-10-07
 * GHSA-vfj7-8cjw-p6xm (braces, every published version, no patched release)
 * reached this repo only through the lint toolchain, and the gate blocked
 * every deploy with nothing to upgrade to. This module keeps the old gate's
 * rule — every HIGH or CRITICAL fails — except for advisories listed in
 * `scripts/audit-allowlist.json`.
 *
 * THE RULE (fail closed)
 *
 * - Only vulnerabilities whose severity is `high` or `critical` are gated,
 *   matching `--audit-level=high`. An unrecognised severity is a violation.
 * - Each gated vulnerability is resolved to its ROOT advisories by walking
 *   `via`: an object is an advisory (its GHSA id comes from `url`/`source`);
 *   a string names another vulnerability entry to recurse into. Cycles are
 *   guarded.
 * - A vulnerability is allowed ONLY when it resolves to at least one advisory,
 *   nothing on the way is unresolvable, and EVERY root advisory is
 *   allow-listed (GHSA id AND package must both match the entry). Anything
 *   else is a violation.
 *
 * Everything here is pure (no I/O, no clock, no process) so it can be unit
 * tested; `audit-gate.mjs` supplies npm, the allow-list file, the date, sleep
 * and stdout. Plain ESM so node runs it without a build step.
 */

/** Severities the gate fails on — the old `--audit-level=high`. */
export const GATED_SEVERITIES = Object.freeze(["high", "critical"]);

/** Every severity npm audit reports; anything else fails closed. */
export const KNOWN_SEVERITIES = Object.freeze(["info", "low", "moderate", "high", "critical"]);

/**
 * What npm prints (on stderr, in `--json` mode too) when the advisory
 * endpoint fails — a 5xx or a refused connection: an outage, not a finding.
 * The same string the sibling apps' shell retry loop matched on (added in
 * mp-senior-care after the endpoint 503'd on its PR #131).
 */
export const ENDPOINT_ERROR_MARKER = "audit endpoint returned an error";

/**
 * The npm audit invocation. The flags after `--json` pin what the old gate
 * audited regardless of any .npmrc or npm_config_* in the environment, both
 * measured with npm 11.19:
 * - `--offline=false`: with `offline=true` npm skips the advisory request and
 *   prints a CLEAN report (0 vulnerabilities, exit 0) — a silent pass.
 * - `--include=dev/optional/peer`: `omit=dev` would drop the devDependency
 *   tree from the audit (the braces chain disappears with it).
 */
export const NPM_AUDIT_ARGS = Object.freeze([
  "audit",
  "--json",
  "--offline=false",
  "--include=dev",
  "--include=optional",
  "--include=peer",
]);

/** Total attempts when the endpoint errors, and the wait between them. */
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 30_000;

/** Exit codes: 0 pass, 1 violation(s), 2 could not verify (fails too). */
export const EXIT_PASS = 0;
export const EXIT_VIOLATION = 1;
export const EXIT_UNVERIFIED = 2;

const GHSA_ID = /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i;
const GHSA_IN_TEXT = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/gi;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {{ id: string, package: string, reason: string, added: string, review_by: string }} AllowlistEntry
 * @typedef {{ id: string | null, package: string | null, title: string | null, url: string | null, severity: string | null, allowListed: boolean }} RootAdvisory
 * @typedef {{ name: string, severity: string, nodes: string[], advisories: RootAdvisory[], entries: AllowlistEntry[] }} AllowedFinding
 * @typedef {{ name: string, severity: string, nodes: string[], advisories: RootAdvisory[], problems: string[] }} Violation
 * @typedef {{ violations: Violation[], allowed: AllowedFinding[], staleEntries: AllowlistEntry[], overdueEntries: AllowlistEntry[] }} GateResult
 * @typedef {{ status: number | null, signal?: string | null, stdout?: string | null, stderr?: string | null, error?: Error | null }} AuditRun
 * @typedef {{ kind: "report", report: Record<string, any> } | { kind: "endpoint-error", detail: string } | { kind: "invalid", detail: string }} ParsedAudit
 */

/** @param {unknown} value @returns {value is Record<string, any>} */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string} */
function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Canonical form for comparing GHSA ids: `GHSA-` + lowercase. @param {string} id */
export function normalizeGhsaId(id) {
  return `GHSA-${id.slice(5).toLowerCase()}`;
}

/** Today's date (UTC) as YYYY-MM-DD. @param {Date} [now] */
export function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * The GHSA id of one `via` advisory object, from its `url` and/or `source`.
 * Returns null when there is none, or when the two disagree.
 * @param {Record<string, any>} advisory
 * @returns {string | null}
 */
export function advisoryGhsaId(advisory) {
  const found = new Set();
  for (const field of [advisory.url, advisory.source]) {
    if (typeof field !== "string") continue;
    for (const match of field.match(GHSA_IN_TEXT) ?? []) found.add(normalizeGhsaId(match));
  }
  return found.size === 1 ? [...found][0] : null;
}

/**
 * Throws unless `allowlist` is a well-formed allow-list. An invalid file must
 * stop the gate, never be read as "nothing allow-listed" or as "allow all".
 * @param {unknown} allowlist
 * @returns {AllowlistEntry[]}
 */
export function validateAllowlist(allowlist) {
  if (!Array.isArray(allowlist)) {
    throw new Error("audit allow-list must be a JSON array");
  }
  const seen = new Set();
  allowlist.forEach((entry, index) => {
    const where = `audit allow-list entry ${index}`;
    if (!isPlainObject(entry)) throw new Error(`${where} must be an object`);
    const allowed = ["id", "package", "reason", "added", "review_by"];
    for (const key of Object.keys(entry)) {
      if (!allowed.includes(key)) throw new Error(`${where} has unknown field "${key}"`);
    }
    if (typeof entry.id !== "string" || !GHSA_ID.test(entry.id)) {
      throw new Error(`${where}: "id" must be a GHSA id (GHSA-xxxx-xxxx-xxxx)`);
    }
    for (const key of ["package", "reason"]) {
      if (typeof entry[key] !== "string" || entry[key].trim() === "") {
        throw new Error(`${where} (${entry.id}): "${key}" must be a non-empty string`);
      }
    }
    for (const key of ["added", "review_by"]) {
      if (!isIsoDate(entry[key])) {
        throw new Error(`${where} (${entry.id}): "${key}" must be a YYYY-MM-DD date`);
      }
    }
    if (entry.review_by <= entry.added) {
      throw new Error(`${where} (${entry.id}): "review_by" must be after "added"`);
    }
    const id = normalizeGhsaId(entry.id);
    if (seen.has(id)) throw new Error(`${where}: duplicate id ${entry.id}`);
    seen.add(id);
  });
  return /** @type {AllowlistEntry[]} */ (allowlist);
}

/**
 * Throws unless `report` looks like an `npm audit --json` report (version 2).
 * Also cross-checks npm's own per-severity counts against the entries, so a
 * format change that moved vulnerabilities elsewhere cannot read as "none".
 * @param {unknown} report
 * @returns {Record<string, any>}
 */
export function assertAuditReport(report) {
  if (!isPlainObject(report)) throw new Error("npm audit output is not a JSON object");
  if (report.auditReportVersion !== 2) {
    throw new Error(`unsupported npm audit report version: ${JSON.stringify(report.auditReportVersion)}`);
  }
  const { vulnerabilities, metadata } = report;
  if (!isPlainObject(vulnerabilities)) throw new Error('npm audit report has no "vulnerabilities" object');
  const counts = isPlainObject(metadata) ? metadata.vulnerabilities : undefined;
  if (!isPlainObject(counts)) throw new Error('npm audit report has no "metadata.vulnerabilities" counts');
  for (const severity of GATED_SEVERITIES) {
    const listed = Object.values(vulnerabilities).filter(
      (v) => isPlainObject(v) && v.severity === severity,
    ).length;
    if (counts[severity] !== listed) {
      throw new Error(
        `npm audit report is inconsistent: metadata counts ${JSON.stringify(counts[severity])} ${severity}, entries list ${listed}`,
      );
    }
  }
  return report;
}

/**
 * Walks `via` from one vulnerability entry down to its root advisories.
 * @param {string} name
 * @param {Record<string, any>} vulnerabilities
 */
function resolveRoots(name, vulnerabilities) {
  /** @type {Map<string, Record<string, any>>} */
  const advisories = new Map();
  /** @type {Record<string, any>[]} */
  const unidentified = [];
  /** @type {string[]} */
  const problems = [];
  const visited = new Set();
  /** @type {string[]} */
  const stack = [name];

  while (stack.length > 0) {
    const current = /** @type {string} */ (stack.pop());
    if (visited.has(current)) continue; // cycle or diamond: already walked
    visited.add(current);

    if (!Object.hasOwn(vulnerabilities, current) || !isPlainObject(vulnerabilities[current])) {
      problems.push(`"${current}" is named in via but has no entry in the audit report`);
      continue;
    }
    const via = vulnerabilities[current].via;
    if (!Array.isArray(via) || via.length === 0) {
      problems.push(`"${current}" has no via, so its advisory cannot be identified`);
      continue;
    }
    for (const item of via) {
      if (typeof item === "string") {
        stack.push(item);
      } else if (isPlainObject(item)) {
        const id = advisoryGhsaId(item);
        if (id === null) {
          unidentified.push(item);
          problems.push(
            `an advisory on "${current}" has no single GHSA id (url ${JSON.stringify(item.url ?? null)}, source ${JSON.stringify(item.source ?? null)})`,
          );
        } else if (!advisories.has(id)) {
          advisories.set(id, item);
        }
      } else {
        problems.push(`"${current}" has an unrecognised via item ${JSON.stringify(item)}`);
      }
    }
  }

  if (advisories.size === 0 && unidentified.length === 0 && problems.length === 0) {
    problems.push(`"${name}" resolves to no advisory`);
  }
  return { advisories, unidentified, problems };
}

/**
 * The gate decision.
 * @param {unknown} auditJson parsed `npm audit --json` output
 * @param {unknown} allowlist parsed `scripts/audit-allowlist.json`
 * @param {string | Date} today YYYY-MM-DD (UTC) or a Date
 * @returns {GateResult}
 */
export function evaluateAudit(auditJson, allowlist, today) {
  const report = assertAuditReport(auditJson);
  const entries = validateAllowlist(allowlist);
  const todayIso = today instanceof Date ? todayUtc(today) : today;
  if (!isIsoDate(todayIso)) throw new Error(`"today" must be a YYYY-MM-DD date, got ${JSON.stringify(today)}`);

  /** @type {Map<string, AllowlistEntry>} */
  const byId = new Map(entries.map((e) => [normalizeGhsaId(e.id), e]));
  /** @type {Record<string, any>} */
  const vulnerabilities = report.vulnerabilities;

  /** @type {Violation[]} */
  const violations = [];
  /** @type {AllowedFinding[]} */
  const allowed = [];

  for (const [name, vuln] of Object.entries(vulnerabilities)) {
    const severity = isPlainObject(vuln) ? vuln.severity : undefined;
    const nodes = isPlainObject(vuln) && Array.isArray(vuln.nodes) ? vuln.nodes.map(String) : [];

    if (typeof severity !== "string" || !KNOWN_SEVERITIES.includes(severity)) {
      violations.push({
        name,
        severity: String(severity),
        nodes,
        advisories: [],
        problems: [`unrecognised severity ${JSON.stringify(severity ?? null)}`],
      });
      continue;
    }
    if (!GATED_SEVERITIES.includes(severity)) continue;

    const { advisories, unidentified, problems } = resolveRoots(name, vulnerabilities);
    /** @type {RootAdvisory[]} */
    const roots = [];
    /** @type {AllowlistEntry[]} */
    const matched = [];
    for (const [id, advisory] of advisories) {
      const entry = byId.get(id);
      const pkg = typeof advisory.name === "string" ? advisory.name : null;
      const allowListed = entry !== undefined && entry.package === pkg;
      if (allowListed) matched.push(entry);
      roots.push({
        id,
        package: pkg,
        title: typeof advisory.title === "string" ? advisory.title : null,
        url: typeof advisory.url === "string" ? advisory.url : null,
        severity: typeof advisory.severity === "string" ? advisory.severity : null,
        allowListed,
      });
    }
    for (const advisory of unidentified) {
      roots.push({
        id: null,
        package: typeof advisory.name === "string" ? advisory.name : null,
        title: typeof advisory.title === "string" ? advisory.title : null,
        url: typeof advisory.url === "string" ? advisory.url : null,
        severity: typeof advisory.severity === "string" ? advisory.severity : null,
        allowListed: false,
      });
    }

    // EVERY root allow-listed, at least one root, nothing unresolvable.
    const isAllowed =
      problems.length === 0 && roots.length > 0 && roots.every((root) => root.allowListed);

    if (isAllowed) {
      allowed.push({ name, severity, nodes, advisories: roots, entries: [...new Set(matched)] });
    } else {
      violations.push({ name, severity, nodes, advisories: roots, problems });
    }
  }

  // An entry is stale once its advisory appears nowhere in the report, at any
  // severity — the dependency was upgraded or removed, so the entry can go.
  const present = new Set();
  for (const vuln of Object.values(vulnerabilities)) {
    if (!isPlainObject(vuln) || !Array.isArray(vuln.via)) continue;
    for (const item of vuln.via) {
      if (!isPlainObject(item)) continue;
      const id = advisoryGhsaId(item);
      if (id !== null) present.add(id);
    }
  }
  const staleEntries = entries.filter((e) => !present.has(normalizeGhsaId(e.id)));
  const overdueEntries = entries.filter((e) => e.review_by < todayIso);

  return { violations, allowed, staleEntries, overdueEntries };
}

/**
 * Classifies one `npm audit --json` run. Never returns "report" for anything
 * that is not a valid report; the endpoint marker wins over everything else.
 * @param {AuditRun} run
 * @returns {ParsedAudit}
 */
export function parseAuditOutput(run) {
  if (run.error) {
    return { kind: "invalid", detail: `could not run npm audit: ${run.error.message}` };
  }
  const stdout = run.stdout ?? "";
  const stderr = run.stderr ?? "";
  if (stdout.includes(ENDPOINT_ERROR_MARKER) || stderr.includes(ENDPOINT_ERROR_MARKER)) {
    let detail = ENDPOINT_ERROR_MARKER;
    try {
      const body = JSON.parse(stdout);
      if (isPlainObject(body) && (body.statusCode !== undefined || body.message !== undefined)) {
        detail = `${ENDPOINT_ERROR_MARKER} (status ${JSON.stringify(body.statusCode ?? null)}: ${String(body.message ?? "")})`;
      }
    } catch {
      // not JSON — the marker alone is enough
    }
    return { kind: "endpoint-error", detail };
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      kind: "invalid",
      detail: `npm audit did not print JSON (exit ${run.status ?? run.signal ?? "unknown"})`,
    };
  }
  if (isPlainObject(parsed) && isPlainObject(parsed.error)) {
    const { code, summary } = parsed.error;
    return { kind: "invalid", detail: `npm audit failed: ${String(code ?? "")} ${String(summary ?? "")}`.trim() };
  }
  try {
    return { kind: "report", report: assertAuditReport(parsed) };
  } catch (error) {
    return { kind: "invalid", detail: /** @type {Error} */ (error).message };
  }
}

/**
 * Escapes a GitHub Actions workflow-command message so a newline or `%`
 * inside it cannot end the annotation early or start another command.
 * @param {string} message
 */
export function escapeAnnotation(message) {
  return message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** @param {"notice" | "warning" | "error"} level @param {string} message */
export function annotation(level, message) {
  return `::${level}::${escapeAnnotation(message)}`;
}

/** @param {RootAdvisory} root */
function describeRoot(root) {
  const id = root.id ?? "advisory without a GHSA id";
  const parts = [`${id} on ${root.package ?? "unknown package"}`];
  if (root.severity) parts.push(`(${root.severity})`);
  if (root.url) parts.push(root.url);
  return parts.join(" ");
}

/**
 * The lines the gate prints for one result, in order: notices for allowed
 * findings, warnings for overdue and stale entries, errors for violations.
 * @param {GateResult} result
 * @returns {string[]}
 */
export function formatResult(result) {
  const lines = [];
  for (const finding of result.allowed) {
    const roots = finding.advisories.map(describeRoot).join("; ");
    const reasons = finding.entries
      .map((e) => `${e.id}: ${e.reason} (allow-listed ${e.added}, review by ${e.review_by})`)
      .join(" | ");
    lines.push(
      annotation(
        "notice",
        `npm audit: allow-listed ${finding.name} (${finding.severity}) — root ${roots}. Reason: ${reasons}`,
      ),
    );
  }
  for (const entry of result.overdueEntries) {
    lines.push(
      annotation(
        "warning",
        `npm audit allow-list: ${entry.id} (${entry.package}) passed its review date ${entry.review_by}. Check for a patched release, then remove the entry or set a new review_by in scripts/audit-allowlist.json.`,
      ),
    );
  }
  for (const entry of result.staleEntries) {
    lines.push(
      annotation(
        "warning",
        `npm audit allow-list: ${entry.id} (${entry.package}) no longer appears in npm audit. Remove it from scripts/audit-allowlist.json.`,
      ),
    );
  }
  for (const violation of result.violations) {
    const roots = violation.advisories.length > 0 ? violation.advisories.map(describeRoot).join("; ") : "none resolved";
    const problems = violation.problems.length > 0 ? ` Problems: ${violation.problems.join("; ")}.` : "";
    const where = violation.nodes.length > 0 ? ` at ${violation.nodes.join(", ")}` : "";
    lines.push(
      annotation(
        "error",
        `npm audit: ${violation.name} (${violation.severity})${where} — advisories: ${roots}.${problems}`,
      ),
    );
  }
  const n = result.violations.length;
  lines.push(
    `npm audit gate: ${n} violation(s), ${result.allowed.length} allow-listed high/critical finding(s), ` +
      `${result.overdueEntries.length} overdue and ${result.staleEntries.length} stale allow-list entr(ies).`,
  );
  if (n > 0) {
    lines.push(
      annotation(
        "error",
        `npm audit found ${n} HIGH or CRITICAL vulnerabilit${n === 1 ? "y" : "ies"} not covered by scripts/audit-allowlist.json.`,
      ),
    );
  }
  return lines;
}

/**
 * The whole gate with its I/O injected. Retries only the endpoint-error case,
 * up to MAX_ATTEMPTS in total, and never passes on an error: an endpoint that
 * stays down, output that is not a valid report, or an invalid allow-list all
 * return EXIT_UNVERIFIED.
 *
 * @param {object} io
 * @param {() => AuditRun} io.runAudit runs `npm audit --json` once
 * @param {(ms: number) => Promise<void>} io.sleep
 * @param {(line: string) => void} io.print
 * @param {unknown} io.allowlist parsed allow-list file
 * @param {string | Date} io.today
 * @param {number} [io.maxAttempts]
 * @param {number} [io.retryDelayMs]
 * @returns {Promise<number>} the process exit code
 */
export async function runGate({
  runAudit,
  sleep,
  print,
  allowlist,
  today,
  maxAttempts = MAX_ATTEMPTS,
  retryDelayMs = RETRY_DELAY_MS,
}) {
  try {
    validateAllowlist(allowlist);
  } catch (error) {
    print(annotation("error", `${/** @type {Error} */ (error).message} — could not verify advisories.`));
    return EXIT_UNVERIFIED;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const parsed = parseAuditOutput(runAudit());
    if (parsed.kind === "endpoint-error") {
      if (attempt < maxAttempts) {
        print(
          annotation(
            "warning",
            `npm audit endpoint unavailable (attempt ${attempt}/${maxAttempts}): ${parsed.detail}; retrying in ${Math.round(retryDelayMs / 1000)}s`,
          ),
        );
        await sleep(retryDelayMs);
        continue;
      }
      print(
        annotation(
          "error",
          `npm audit endpoint unavailable after ${maxAttempts} attempts (${parsed.detail}) — could not verify advisories.`,
        ),
      );
      return EXIT_UNVERIFIED;
    }
    if (parsed.kind === "invalid") {
      print(annotation("error", `${parsed.detail} — could not verify advisories.`));
      return EXIT_UNVERIFIED;
    }

    let result;
    try {
      result = evaluateAudit(parsed.report, allowlist, today);
    } catch (error) {
      print(annotation("error", `${/** @type {Error} */ (error).message} — could not verify advisories.`));
      return EXIT_UNVERIFIED;
    }
    for (const line of formatResult(result)) print(line);
    return result.violations.length > 0 ? EXIT_VIOLATION : EXIT_PASS;
  }
  // Unreachable with maxAttempts >= 1; fail closed if it is ever reached.
  print(annotation("error", "npm audit did not run — could not verify advisories."));
  return EXIT_UNVERIFIED;
}
