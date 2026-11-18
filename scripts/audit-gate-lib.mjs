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
 * - An allow-list entry is a DEV-ONLY exception. Whenever one is in use, the
 *   gate audits the production tree too (`npm audit --omit=dev`); if an
 *   allow-listed advisory's GHSA id shows up there at any severity, under any
 *   package name or none, the premise of the entry no longer holds and the
 *   gate fails. Trivy cannot catch that case: it
 *   runs with `ignore-unfixed`, and an allow-listed advisory has no fix.
 * - The one opt-in exception to that: an entry may carry
 *   `production_via_optional_peer`, a list of exact (from, peer) edges, each an
 *   OPTIONAL peer dependency that a production package declares (better-auth
 *   1.7 declares vitest as one, so npm marks vitest devOptional and keeps it in
 *   `--omit=dev`). When such an entry's advisory is in the production audit,
 *   the gate reads package-lock.json and package.json (through the injected
 *   `readProjectFile`, which serves only those two names) and must PROVE, from
 *   the lockfile, that every node of the package is reachable from the root's
 *   production edges only through those declared edges. The proof models
 *   npm's own resolution (Arborist `Node.resolve`) and is first checked
 *   against npm's dev flags in the lockfile (`calcDepFlags`): any
 *   disagreement, a lockfile that is not v3 or does not match package.json,
 *   or a report that does not bind to the lockfile is EXIT_UNVERIFIED (2).
 *   A broken premise, or any path that avoids the declared edges, is
 *   EXIT_VIOLATION (1) with witness paths.
 *
 * Everything here is pure (no I/O, no clock, no process) so it can be unit
 * tested; `audit-gate.mjs` supplies npm, the allow-list file, the two project
 * files, the date, sleep and stdout. Plain ESM so node runs it without a
 * build step.
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

/**
 * The production-tree audit: what `npm ci --omit=dev` installs. Only used to
 * check that allow-listed (dev-only) advisories stay out of it. The same pins
 * as NPM_AUDIT_ARGS, except that dev is omitted on purpose; `optional` and
 * `peer` stay included, because an `omit=optional` or `omit=peer` setting
 * would hide part of the production tree. Measured with npm 11.19: braces made
 * a production dependency is listed under these flags even with
 * `offline=true`, `NODE_ENV=production` or `omit=optional` set.
 */
export const NPM_AUDIT_PROD_ARGS = Object.freeze([
  "audit",
  "--json",
  "--offline=false",
  "--omit=dev",
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
 * @typedef {{ from: string, peer: string }} OptionalPeerEdge
 * @typedef {{ id: string, package: string, reason: string, added: string, review_by: string, production_via_optional_peer?: OptionalPeerEdge[] }} AllowlistEntry
 * @typedef {{ kind: "proven", targets: string[], nodes: string[], paths: string[] } | { kind: "exposed", witnesses: string[], reasons: string[], problems: string[] } | { kind: "unprovable", problems: string[] }} ProofResult
 * @typedef {ProofResult & { entry: AllowlistEntry }} EntryProof
 * @typedef {{ reached: Set<string>, pathTo: (loc: string) => string }} Reach
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
 * Masks the userinfo of any URL in `text` (`https://user:token@host` ->
 * `https://***@host`). npm's error messages embed the registry URL, and a
 * registry configured with credentials in its URL must not reach the CI log.
 * @param {string} text
 */
export function redactUrlCredentials(text) {
  return text.replace(/(\/\/)[^/\s@]+@/g, "$1***@");
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

/** The opt-in allow-list field: exact optional-peer edges, proven from the lockfile. */
export const OPTIONAL_PEER_FIELD = "production_via_optional_peer";

/** At most this many (from, peer) edges per entry. */
export const MAX_OPTIONAL_PEER_EDGES = 4;

/** An entry carrying OPTIONAL_PEER_FIELD must be reviewed within this many days of `added`. */
export const OPTIONAL_PEER_MAX_REVIEW_DAYS = 45;

/** A plain npm package name: lowercase, optionally scoped, no path tricks. */
const NPM_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;

/** @param {unknown} value */
function isPlainNpmName(value) {
  return (
    typeof value === "string" &&
    value.length <= 214 &&
    NPM_NAME.test(value) &&
    !value.includes("..") &&
    !value.includes("node_modules")
  );
}

/**
 * Throws unless `entry[OPTIONAL_PEER_FIELD]` is well formed. Called only when
 * the key is present, after the entry's other fields have validated.
 * @param {Record<string, any>} entry
 * @param {string} where
 */
function validateOptionalPeerField(entry, where) {
  const edges = entry[OPTIONAL_PEER_FIELD];
  if (!Array.isArray(edges) || edges.length < 1 || edges.length > MAX_OPTIONAL_PEER_EDGES) {
    throw new Error(
      `${where}: "${OPTIONAL_PEER_FIELD}" must be an array of 1 to ${MAX_OPTIONAL_PEER_EDGES} {"from", "peer"} objects`,
    );
  }
  const seen = new Set();
  edges.forEach((edge, i) => {
    const at = `${where}: "${OPTIONAL_PEER_FIELD}"[${i}]`;
    if (!isPlainObject(edge)) throw new Error(`${at} must be an object`);
    const keys = Object.keys(edge).sort();
    if (keys.length !== 2 || keys[0] !== "from" || keys[1] !== "peer") {
      throw new Error(`${at} must have exactly the keys "from" and "peer"`);
    }
    for (const key of ["from", "peer"]) {
      if (!isPlainNpmName(edge[key])) {
        throw new Error(`${at}: "${key}" must be a plain lowercase npm package name`);
      }
    }
    if (edge.from === edge.peer) throw new Error(`${at}: "from" and "peer" must differ`);
    if (edge.from === entry.package) throw new Error(`${at}: "from" must not be the advisory's own package`);
    const pair = JSON.stringify([edge.from, edge.peer]);
    if (seen.has(pair)) throw new Error(`${at}: duplicate edge ${edge.from} > ${edge.peer}`);
    seen.add(pair);
  });
  const days = (Date.parse(`${entry.review_by}T00:00:00Z`) - Date.parse(`${entry.added}T00:00:00Z`)) / 86_400_000;
  if (days > OPTIONAL_PEER_MAX_REVIEW_DAYS) {
    throw new Error(
      `${where}: an entry with "${OPTIONAL_PEER_FIELD}" must have "review_by" at most ${OPTIONAL_PEER_MAX_REVIEW_DAYS} days after "added"`,
    );
  }
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
    const allowed = ["id", "package", "reason", "added", "review_by", OPTIONAL_PEER_FIELD];
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
    if (Object.hasOwn(entry, OPTIONAL_PEER_FIELD)) validateOptionalPeerField(entry, `${where} (${entry.id})`);
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
  const present = new Set(reportAdvisories(vulnerabilities).map((a) => a.id));
  const staleEntries = entries.filter((e) => !present.has(normalizeGhsaId(e.id)));
  const overdueEntries = entries.filter((e) => e.review_by < todayIso);

  return { violations, allowed, staleEntries, overdueEntries };
}

/**
 * Every advisory object in any `via` of the report that has a single GHSA id,
 * with the package it was filed against.
 * @param {Record<string, any>} vulnerabilities
 * @returns {{ id: string, package: string | null }[]}
 */
function reportAdvisories(vulnerabilities) {
  const found = [];
  for (const vuln of Object.values(vulnerabilities)) {
    if (!isPlainObject(vuln) || !Array.isArray(vuln.via)) continue;
    for (const item of vuln.via) {
      if (!isPlainObject(item)) continue;
      const id = advisoryGhsaId(item);
      if (id !== null) found.push({ id, package: typeof item.name === "string" ? item.name : null });
    }
  }
  return found;
}

/**
 * The allow-list entries whose advisory appears, at any severity, in a
 * PRODUCTION-ONLY audit report (`npm audit --omit=dev`). Matched on the GHSA
 * id ALONE, under any package name or none: an advisory the production audit
 * files under a different (or missing) package than the entry's is still in
 * production, and must not read as absent. Every entry is a dev-only
 * exception, so any entry returned here no longer holds and the gate must
 * fail, unless it carries OPTIONAL_PEER_FIELD, whose proof then refuses a
 * report that files the id under another package (exit 2). Validates the
 * report and the allow-list the same way `evaluateAudit` does, and throws
 * rather than read a bad report as clean.
 * @param {unknown} prodAuditJson parsed `npm audit --json --omit=dev` output
 * @param {unknown} allowlist parsed `scripts/audit-allowlist.json`
 * @returns {AllowlistEntry[]}
 */
export function productionExposedEntries(prodAuditJson, allowlist) {
  const report = assertAuditReport(prodAuditJson);
  const entries = validateAllowlist(allowlist);
  const present = new Set(reportAdvisories(report.vulnerabilities).map((a) => a.id));
  return entries.filter((e) => present.has(normalizeGhsaId(e.id)));
}

// ---------------------------------------------------------------------------
// production_via_optional_peer: the lockfile proof
//
// Models what npm 11's Arborist does with a v3 lockfile (verified against
// @npmcli/arborist in npm 11.19.1):
// - node.js `loadDeps`: a node's edges are its peerDependencies (type `peer`,
//   or `peerOptional` when peerDependenciesMeta[name].optional), then
//   dependencies (`prod`), then optionalDependencies (`optional`), each later
//   type replacing an earlier edge of the same name; devDependencies only for
//   the root, last.
// - edge.js: every edge, peers included, resolves with `from.resolve(name)`,
//   which is node.js `resolve`: the node's own node_modules child, then each
//   resolveParent's, up to the root.
// - calc-dep-flags.js: `dev` is cleared across every non-dev edge whose target
//   exists, from the root outwards, so the non-dev nodes are exactly those
//   reachable from the root over non-dev edges.
// The model is never trusted on its own: `checkProductionModel` requires it to
// reproduce npm's own dev flags in the lockfile exactly.
// ---------------------------------------------------------------------------

const NODE_PATH = /^(node_modules\/(@[^/]+\/)?[^/]+\/)*node_modules\/(@[^/]+\/)?[^/]+$/;
const NODE_MODULES = "node_modules/";

/** Key-sorted JSON, for comparing package.json fields with the lockfile root. @param {unknown} value @returns {string} */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** @param {unknown} value */
function isStringMap(value) {
  return isPlainObject(value) && Object.values(value).every((v) => typeof v === "string");
}

/**
 * Throws unless `lock` is a v3 package-lock.json whose shape the proof can
 * model, and whose root matches `pj` (package.json).
 * @param {unknown} lock parsed package-lock.json
 * @param {unknown} pj parsed package.json
 * @returns {Record<string, Record<string, any>>} lock.packages
 */
export function assertProjectFiles(lock, pj) {
  if (!isPlainObject(lock)) throw new Error("package-lock.json is not a JSON object");
  if (lock.lockfileVersion !== 3) {
    throw new Error(`package-lock.json: lockfileVersion must be 3, got ${JSON.stringify(lock.lockfileVersion ?? null)}`);
  }
  if (Object.hasOwn(lock, "dependencies")) {
    throw new Error('package-lock.json has a legacy top-level "dependencies" section');
  }
  const packages = lock.packages;
  if (!isPlainObject(packages)) throw new Error('package-lock.json has no "packages" object');
  if (!isPlainObject(packages[""])) throw new Error('package-lock.json has no root package ("")');
  if (!isPlainObject(pj)) throw new Error("package.json is not a JSON object");
  if (Object.hasOwn(pj, "workspaces") || Object.hasOwn(packages[""], "workspaces")) {
    throw new Error("package-lock.json: workspaces are not supported by the optional-peer proof");
  }
  for (const [loc, node] of Object.entries(packages)) {
    if (loc !== "" && !NODE_PATH.test(loc)) throw new Error(`package-lock.json: ${JSON.stringify(loc)} is not a node_modules path`);
    if (!isPlainObject(node)) throw new Error(`package-lock.json: ${JSON.stringify(loc)} is not an object`);
    if (node.link === true) throw new Error(`package-lock.json: ${JSON.stringify(loc)} is a link`);
    for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      if (node[key] !== undefined && !isStringMap(node[key])) {
        throw new Error(`package-lock.json: ${JSON.stringify(loc)} has a malformed "${key}"`);
      }
    }
    const meta = node.peerDependenciesMeta;
    if (meta !== undefined && !(isPlainObject(meta) && Object.values(meta).every(isPlainObject))) {
      throw new Error(`package-lock.json: ${JSON.stringify(loc)} has a malformed "peerDependenciesMeta"`);
    }
  }
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta"]) {
    if (canonicalJson(pj[key] ?? {}) !== canonicalJson(packages[""][key] ?? {})) {
      throw new Error(`package-lock.json is out of sync with package.json ("${key}" differs)`);
    }
  }
  return packages;
}

/** The name a lockfile location is installed under (scope kept). @param {string} loc */
export function installedName(loc) {
  return loc.slice(loc.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);
}

/** The package's real name: `name` in the lockfile (an alias), else the installed name. @param {Record<string, any>} packages @param {string} loc */
function realName(packages, loc) {
  return typeof packages[loc]?.name === "string" ? packages[loc].name : installedName(loc);
}

/** True when `loc` is a node of `pkg` by either name — over-inclusive on purpose. @param {Record<string, any>} packages @param {string} loc @param {string} pkg */
function isPackageNode(packages, loc, pkg) {
  return loc !== "" && (installedName(loc) === pkg || realName(packages, loc) === pkg);
}

/**
 * Every lockfile node of `pkg`, any version, by installed or real name.
 * @param {Record<string, any>} packages @param {string} pkg
 */
export function packageNodes(packages, pkg) {
  return Object.keys(packages).filter((loc) => isPackageNode(packages, loc, pkg));
}

/**
 * Arborist's `Node.resolve(name)` over lockfile keys: the node's own
 * node_modules child, then each ancestor's, then the root's.
 * @param {Record<string, any>} packages
 * @param {string} fromLoc "" for the root
 * @param {string} name
 * @returns {string | null}
 */
export function resolveDep(packages, fromLoc, name) {
  let loc = fromLoc;
  while (loc !== "") {
    const candidate = `${loc}/${NODE_MODULES}${name}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    const cut = loc.lastIndexOf(`/${NODE_MODULES}`);
    loc = cut === -1 ? "" : loc.slice(0, cut);
  }
  const top = `${NODE_MODULES}${name}`;
  return Object.hasOwn(packages, top) ? top : null;
}

/**
 * One node's out-edges as Arborist loads them, name -> type.
 * @param {Record<string, any>} node @param {boolean} isRoot
 * @returns {Map<string, "peer" | "peerOptional" | "dep" | "optional" | "dev">}
 */
function edgesOut(node, isRoot) {
  /** @type {Map<string, "peer" | "peerOptional" | "dep" | "optional" | "dev">} */
  const edges = new Map();
  const meta = node.peerDependenciesMeta ?? {};
  for (const name of Object.keys(node.peerDependencies ?? {})) {
    edges.set(name, meta[name]?.optional === true ? "peerOptional" : "peer");
  }
  for (const name of Object.keys(node.dependencies ?? {})) edges.set(name, "dep");
  for (const name of Object.keys(node.optionalDependencies ?? {})) edges.set(name, "optional");
  if (isRoot) for (const name of Object.keys(node.devDependencies ?? {})) edges.set(name, "dev");
  return edges;
}

/**
 * Breadth-first reach from the root over production edges (never dev). A
 * required edge (dep, peer) that resolves to nothing throws; an optional or
 * peerOptional one is simply absent, as in calcDepFlags. `skip` removes
 * individual edges.
 * @param {Record<string, any>} packages
 * @param {(loc: string, name: string, type: string) => boolean} [skip]
 * @returns {Reach}
 */
export function reachProduction(packages, skip = () => false) {
  /** @type {Map<string, { prev: string, type: string } | null>} */
  const parent = new Map([["", null]]);
  const queue = [""];
  for (let i = 0; i < queue.length; i++) {
    const loc = queue[i];
    for (const [name, type] of edgesOut(packages[loc], loc === "")) {
      if (type === "dev" || skip(loc, name, type)) continue;
      const to = resolveDep(packages, loc, name);
      if (to === null) {
        if (type === "dep" || type === "peer") {
          throw new Error(`package-lock.json: ${loc === "" ? "the root" : loc} requires ${name}, which does not resolve`);
        }
        continue;
      }
      if (parent.has(to)) continue;
      parent.set(to, { prev: loc, type });
      queue.push(to);
    }
  }
  return {
    reached: new Set(parent.keys()),
    pathTo(loc) {
      const parts = [];
      let cur = loc;
      for (let step = parent.get(cur); step; step = parent.get(cur)) {
        parts.unshift(`-${step.type}-> ${cur}`);
        cur = step.prev;
      }
      return ["root", ...parts].join(" ");
    },
  };
}

/**
 * Reaches the production graph and requires it to equal npm's own non-dev
 * set in the lockfile. Throws on any disagreement (the model, or the lockfile,
 * cannot be trusted). Returns the reach, root included.
 * @param {Record<string, any>} packages from `assertProjectFiles`
 * @returns {Reach}
 */
export function checkProductionModel(packages) {
  const model = reachProduction(packages);
  const npmProd = new Set(Object.keys(packages).filter((loc) => loc !== "" && packages[loc].dev !== true));
  const modelOnly = [...model.reached].filter((loc) => loc !== "" && !npmProd.has(loc));
  const npmOnly = [...npmProd].filter((loc) => !model.reached.has(loc));
  if (modelOnly.length > 0 || npmOnly.length > 0) {
    const list = (/** @type {string[]} */ locs) => (locs.length === 0 ? "none" : locs.slice(0, 5).join(", "));
    throw new Error(
      `package-lock.json: the production-reach model disagrees with npm's dev flags (model-only: ${list(modelOnly)}; npm-only: ${list(npmOnly)})`,
    );
  }
  return model;
}

/** "a > b, c > d" @param {OptionalPeerEdge[]} edges */
function describeEdges(edges) {
  return edges.map((e) => `${e.from} > ${e.peer}`).join(", ");
}

/**
 * Proves, from the lockfile, that `entry`'s package reaches the production
 * tree only through the entry's declared optional-peer edges. Gathers every
 * problem and reason rather than stopping at the first.
 * - "unprovable": the report does not bind to the lockfile (exit 2)
 * - "exposed": a premise is broken, or a path avoids the edges (exit 1)
 * @param {AllowlistEntry} entry carries OPTIONAL_PEER_FIELD
 * @param {Record<string, any>} prodReport validated `npm audit --omit=dev` report
 * @param {Record<string, any>} packages from `assertProjectFiles`
 * @param {Reach} production from `checkProductionModel`
 * @returns {ProofResult}
 */
export function proveOptionalPeerOnly(entry, prodReport, packages, production) {
  const pkg = entry.package;
  const edges = entry[OPTIONAL_PEER_FIELD] ?? [];
  const gid = normalizeGhsaId(entry.id);
  const U = production.reached;
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const witnesses = [];

  // (a) The report binds to the lockfile.
  const vulnerabilities = prodReport.vulnerabilities;
  for (const advisory of reportAdvisories(vulnerabilities)) {
    if (advisory.id === gid && advisory.package !== pkg) {
      problems.push(`${entry.id} appears under another package (${JSON.stringify(advisory.package)})`);
    }
  }
  const vuln = Object.hasOwn(vulnerabilities, pkg) ? vulnerabilities[pkg] : undefined;
  const reported = isPlainObject(vuln) && Array.isArray(vuln.nodes) ? vuln.nodes : null;
  /** @type {string[]} */
  let nodes = [];
  if (reported === null || reported.length === 0 || !reported.every((n) => typeof n === "string")) {
    problems.push(`npm audit --omit=dev has no node list for ${pkg}`);
  } else {
    nodes = reported;
    for (const n of nodes) {
      if (!Object.hasOwn(packages, n) || !isPackageNode(packages, n, pkg) || packages[n].dev === true || !U.has(n)) {
        problems.push(`npm audit --omit=dev lists ${n}, which package-lock.json does not have as a production ${pkg} node`);
      }
    }
  }

  // (b) Targets: every node of the package, any version.
  const targets = packageNodes(packages, pkg);
  if (targets.length === 0) problems.push(`package-lock.json has no ${pkg} node`);
  for (const t of targets) {
    if (packages[t].inBundle) problems.push(`${t} is a bundled dependency`);
  }
  const T = new Set(targets);

  // (c) The declared edges exist exactly as declared, on every production copy of `from`.
  /** @type {Map<string, string[]>} */
  const fromCopies = new Map();
  for (const { from, peer } of edges) {
    const copies = [...U].filter((loc) => loc !== "" && installedName(loc) === from);
    fromCopies.set(from, copies);
    if (copies.length === 0) {
      reasons.push(`${from} is not in the production tree`);
      continue;
    }
    for (const loc of copies) {
      const node = packages[loc];
      const name = realName(packages, loc);
      if (name !== from) reasons.push(`${loc} is installed as ${from} but is ${name}`);
      if (T.has(loc)) reasons.push(`${loc} is itself a ${pkg} node`);
      if (node.inBundle) reasons.push(`${loc} is a bundled dependency`);
      if (typeof node.peerDependencies?.[peer] !== "string" || node.peerDependenciesMeta?.[peer]?.optional !== true) {
        reasons.push(`${loc} does not declare ${peer} as an optional peer`);
      }
      if (Object.hasOwn(node.dependencies ?? {}, peer) || Object.hasOwn(node.optionalDependencies ?? {}, peer)) {
        reasons.push(`${loc} also lists ${peer} as a dependency`);
      }
      for (const key of ["bundleDependencies", "bundledDependencies"]) {
        const bundled = node[key];
        if (bundled === undefined || bundled === false) continue;
        if (!Array.isArray(bundled) || bundled.includes(peer) || bundled.includes(pkg)) {
          reasons.push(`${loc} bundles ${peer} or ${pkg}`);
        }
      }
    }
    if (
      !copies.some((loc) => {
        const to = resolveDep(packages, loc, peer);
        return to !== null && U.has(to);
      })
    ) {
      reasons.push(`${from} > ${peer} does not resolve to an installed production node`);
    }
  }

  // (d) The proof: with exactly those edges removed, no node of the package is reachable.
  const declared = new Set(edges.map((e) => JSON.stringify([e.from, e.peer])));
  const restricted = reachProduction(
    packages,
    (loc, name, type) =>
      type === "peerOptional" &&
      loc !== "" &&
      installedName(loc) === realName(packages, loc) &&
      declared.has(JSON.stringify([installedName(loc), name])),
  );
  for (const [from, copies] of fromCopies) {
    if (copies.length > 0 && !copies.some((loc) => restricted.reached.has(loc))) {
      reasons.push(`${from} is in production only through excluded edges`);
    }
  }
  for (const w of targets.filter((t) => restricted.reached.has(t))) {
    reasons.push(`${w} is reachable from production dependencies without ${describeEdges(edges)}`);
    if (witnesses.length < 3) witnesses.push(restricted.pathTo(w));
  }

  // (e) Exposed beats unprovable.
  if (reasons.length > 0) return { kind: "exposed", witnesses, reasons, problems };
  if (problems.length > 0) return { kind: "unprovable", problems };
  const proven = targets.filter((t) => U.has(t));
  return { kind: "proven", targets: proven, nodes, paths: proven.map((t) => production.pathTo(t)) };
}

/**
 * Classifies one `npm audit --json` run. Never returns "report" for anything
 * that is not a valid report; the endpoint marker wins over everything else.
 * @param {AuditRun} run
 * @returns {ParsedAudit}
 */
export function parseAuditOutput(run) {
  if (run.error) {
    return { kind: "invalid", detail: redactUrlCredentials(`could not run npm audit: ${run.error.message}`) };
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
    return { kind: "endpoint-error", detail: redactUrlCredentials(detail) };
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
    return {
      kind: "invalid",
      detail: redactUrlCredentials(`npm audit failed: ${String(code ?? "")} ${String(summary ?? "")}`.trim()),
    };
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
 * The lines the gate prints for the production-tree check: an error for each
 * allow-list entry whose advisory reached a production dependency, or one
 * line saying none did. Entries carrying OPTIONAL_PEER_FIELD are reported
 * through `proofs` instead (a notice when proven, an error otherwise), and
 * `unusedField` lists such entries the production audit no longer mentions.
 * @param {AllowlistEntry[]} exposed entries without the field, from `productionExposedEntries`
 * @param {EntryProof[]} [proofs] one per exposed entry that carries the field
 * @param {AllowlistEntry[]} [unusedField] entries with the field absent from the production audit
 * @returns {string[]}
 */
export function formatProductionCheck(exposed, proofs = [], unusedField = []) {
  const lines = exposed.map((entry) =>
    annotation(
      "error",
      `npm audit: allow-listed ${entry.id} (${entry.package}) now reaches a production dependency (npm audit --omit=dev lists it); the dev-only exception no longer holds. Remove that production path, or treat the advisory as a violation and remove the entry from scripts/audit-allowlist.json.`,
    ),
  );
  for (const proof of proofs) {
    const { entry } = proof;
    const edges = describeEdges(entry[OPTIONAL_PEER_FIELD] ?? []);
    if (proof.kind === "exposed") {
      const witness = proof.witnesses.length > 0 ? ` Witness: ${proof.witnesses.join("; ")}.` : "";
      const unverified = proof.problems.length > 0 ? ` Also could not verify: ${proof.problems.join("; ")}.` : "";
      lines.push(
        annotation(
          "error",
          `npm audit: allow-listed ${entry.id} (${entry.package}) reaches a production dependency outside its declared optional peer edge(s) ${edges}: ${proof.reasons.join("; ")}.${witness}${unverified} The dev-only exception no longer holds. Remove that production path, or treat the advisory as a violation and remove the entry from scripts/audit-allowlist.json.`,
        ),
      );
    } else if (proof.kind === "unprovable") {
      lines.push(
        annotation(
          "error",
          `npm audit --omit=dev: could not prove allow-listed ${entry.id} (${entry.package}) is limited to its declared optional peer edge(s) ${edges}: ${proof.problems.join("; ")} — could not verify advisories.`,
        ),
      );
    } else {
      lines.push(
        annotation(
          "notice",
          `npm audit --omit=dev: allow-listed ${entry.id} (${entry.package}) is in the production tree only through the optional peer edge(s) ${edges} (${OPTIONAL_PEER_FIELD}, proven from package-lock.json); without them no production dependency reaches any ${entry.package} node. Reported nodes: ${proof.nodes.join(", ")}. Path: ${proof.paths[0] ?? "none"}. Reason: ${entry.reason}`,
        ),
      );
    }
  }
  for (const entry of unusedField) {
    lines.push(
      annotation(
        "warning",
        `npm audit allow-list: ${entry.id} (${entry.package}) no longer appears in npm audit --omit=dev; remove ${OPTIONAL_PEER_FIELD} from scripts/audit-allowlist.json.`,
      ),
    );
  }
  if (exposed.length === 0 && proofs.every((p) => p.kind === "proven")) {
    lines.push(
      proofs.length === 0
        ? "npm audit gate: no allow-listed advisory reaches a production dependency (npm audit --omit=dev)."
        : `npm audit gate: no allow-listed advisory reaches a production dependency (npm audit --omit=dev) except ${proofs.length} advisory(ies) proven to come only through declared optional peer edges.`,
    );
  }
  return lines;
}

/**
 * One audit, retrying only the endpoint-error case, up to `maxAttempts` in
 * total. Returns the report, or null after printing why it could not be
 * verified — never a report it could not read.
 * @param {object} io
 * @param {(args: readonly string[]) => AuditRun} io.runAudit
 * @param {readonly string[]} io.args
 * @param {string} io.label how the messages name this audit
 * @param {(ms: number) => Promise<void>} io.sleep
 * @param {(line: string) => void} io.print
 * @param {number} io.maxAttempts
 * @param {number} io.retryDelayMs
 * @returns {Promise<Record<string, any> | null>}
 */
async function auditWithRetry({ runAudit, args, label, sleep, print, maxAttempts, retryDelayMs }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const parsed = parseAuditOutput(runAudit(args));
    if (parsed.kind === "report") return parsed.report;
    if (parsed.kind === "endpoint-error") {
      if (attempt < maxAttempts) {
        print(
          annotation(
            "warning",
            `${label} endpoint unavailable (attempt ${attempt}/${maxAttempts}): ${parsed.detail}; retrying in ${Math.round(retryDelayMs / 1000)}s`,
          ),
        );
        await sleep(retryDelayMs);
        continue;
      }
      print(
        annotation(
          "error",
          `${label} endpoint unavailable after ${maxAttempts} attempts (${parsed.detail}) — could not verify advisories.`,
        ),
      );
      return null;
    }
    print(annotation("error", `${parsed.detail} — could not verify advisories.`));
    return null;
  }
  // Unreachable with maxAttempts >= 1; fail closed if it is ever reached.
  print(annotation("error", `${label} did not run — could not verify advisories.`));
  return null;
}

/**
 * The whole gate with its I/O injected. Never passes on an error: an endpoint
 * that stays down (after MAX_ATTEMPTS), output that is not a valid report, or
 * an invalid allow-list all return EXIT_UNVERIFIED.
 *
 * 1. `npm audit` over the full tree (NPM_AUDIT_ARGS), decided by
 *    `evaluateAudit`. Any violation: EXIT_VIOLATION.
 * 2. Only when that passed with at least one allow-listed finding: `npm audit
 *    --omit=dev` (NPM_AUDIT_PROD_ARGS). Any allow-listed advisory found in the
 *    production tree: EXIT_VIOLATION, except for an entry carrying
 *    OPTIONAL_PEER_FIELD, which is instead proven from package-lock.json
 *    (`proveOptionalPeerOnly`): exposed is EXIT_VIOLATION, unprovable (or a
 *    project file that cannot be read or modelled) is EXIT_UNVERIFIED, and
 *    any plain exposed entry or exposed proof beats an unprovable one.
 *
 * @param {object} io
 * @param {(args: readonly string[]) => AuditRun} io.runAudit runs `npm <args>` once
 * @param {(ms: number) => Promise<void>} io.sleep
 * @param {(line: string) => void} io.print
 * @param {unknown} io.allowlist parsed allow-list file
 * @param {string | Date} io.today
 * @param {(name: "package-lock.json" | "package.json") => string} [io.readProjectFile]
 *   returns the text of one of the two project files; read only when an
 *   entry carrying OPTIONAL_PEER_FIELD appears in the production audit
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
  readProjectFile = () => {
    throw new Error("no project-file reader");
  },
  maxAttempts = MAX_ATTEMPTS,
  retryDelayMs = RETRY_DELAY_MS,
}) {
  try {
    validateAllowlist(allowlist);
  } catch (error) {
    print(annotation("error", `${/** @type {Error} */ (error).message} — could not verify advisories.`));
    return EXIT_UNVERIFIED;
  }
  const retry = { runAudit, sleep, print, maxAttempts, retryDelayMs };

  const report = await auditWithRetry({ ...retry, args: NPM_AUDIT_ARGS, label: "npm audit" });
  if (report === null) return EXIT_UNVERIFIED;
  let result;
  try {
    result = evaluateAudit(report, allowlist, today);
  } catch (error) {
    print(annotation("error", `${/** @type {Error} */ (error).message} — could not verify advisories.`));
    return EXIT_UNVERIFIED;
  }
  for (const line of formatResult(result)) print(line);
  if (result.violations.length > 0) return EXIT_VIOLATION;
  // No exception in use, so there is no dev-only premise to check.
  if (result.allowed.length === 0) return EXIT_PASS;

  const prodReport = await auditWithRetry({ ...retry, args: NPM_AUDIT_PROD_ARGS, label: "npm audit --omit=dev" });
  if (prodReport === null) return EXIT_UNVERIFIED;
  let exposed;
  try {
    exposed = productionExposedEntries(prodReport, allowlist);
  } catch (error) {
    print(
      annotation("error", `npm audit --omit=dev: ${/** @type {Error} */ (error).message} — could not verify advisories.`),
    );
    return EXIT_UNVERIFIED;
  }
  const entries = validateAllowlist(allowlist);
  const hasField = (/** @type {AllowlistEntry} */ e) => Object.hasOwn(e, OPTIONAL_PEER_FIELD);
  const plain = exposed.filter((e) => !hasField(e));
  const fielded = exposed.filter(hasField);
  const unusedField = entries.filter((e) => hasField(e) && !exposed.includes(e));

  /** @type {EntryProof[]} */
  let proofs = [];
  if (fielded.length > 0) {
    try {
      const lock = JSON.parse(readProjectFile("package-lock.json"));
      const pj = JSON.parse(readProjectFile("package.json"));
      const packages = assertProjectFiles(lock, pj);
      const production = checkProductionModel(packages);
      proofs = fielded.map((entry) => ({ ...proveOptionalPeerOnly(entry, prodReport, packages, production), entry }));
    } catch (error) {
      if (plain.length > 0) for (const line of formatProductionCheck(plain)) print(line);
      print(
        annotation(
          "error",
          `npm audit --omit=dev: could not check ${OPTIONAL_PEER_FIELD} for ${fielded.map((e) => `${e.id} (${e.package})`).join(", ")}: ${/** @type {Error} */ (error).message} — could not verify advisories.`,
        ),
      );
      return plain.length > 0 ? EXIT_VIOLATION : EXIT_UNVERIFIED;
    }
  }
  for (const line of formatProductionCheck(plain, proofs, unusedField)) print(line);
  if (plain.length > 0 || proofs.some((p) => p.kind === "exposed")) return EXIT_VIOLATION;
  if (proofs.some((p) => p.kind === "unprovable")) return EXIT_UNVERIFIED;
  return EXIT_PASS;
}
