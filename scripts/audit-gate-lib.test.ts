// @vitest-environment node
import { afterEach, describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

import {
  ENDPOINT_ERROR_MARKER,
  EXIT_PASS,
  EXIT_UNVERIFIED,
  EXIT_VIOLATION,
  MAX_ATTEMPTS,
  NPM_AUDIT_ARGS,
  NPM_AUDIT_PROD_ARGS,
  RETRY_DELAY_MS,
  advisoryGhsaId,
  OPTIONAL_PEER_FIELD,
  annotation,
  assertAuditReport,
  assertProjectFiles,
  checkProductionModel,
  evaluateAudit,
  formatProductionCheck,
  formatResult,
  packageNodes,
  parseAuditOutput,
  productionExposedEntries,
  proveOptionalPeerOnly,
  reachProduction,
  redactUrlCredentials,
  resolveDep,
  runGate,
  validateAllowlist,
} from "./audit-gate-lib.mjs";

/**
 * The npm audit deploy gate (scripts/audit-gate.mjs). The fixtures copy the
 * shape of real `npm audit --json` output (auditReportVersion 2, npm 11): an
 * advisory is an object in `via`, a dependent ("metavuln") names the
 * vulnerable package as a string.
 */

const BRACES = "GHSA-vfj7-8cjw-p6xm";
const SHARP = "GHSA-wq5f-xc86-pv6w";
const SOURCE_MAP_JS = "GHSA-68fv-2mgg-jv7q";
const PICOMATCH = "GHSA-fc5q-39xc-vjpf";
const MINIMATCH = "GHSA-g3hv-75wg-m249";
const TODAY = "2026-10-07";

type Vuln = Record<string, unknown>;

function advisory(pkg: string, ghsa: string, severity = "high", extra: Record<string, unknown> = {}) {
  return {
    source: 1240000 + pkg.length,
    name: pkg,
    dependency: pkg,
    title: `${pkg} test advisory`,
    url: `https://github.com/advisories/${ghsa}`,
    severity,
    cwe: [],
    cvss: { score: 7.5, vectorString: null },
    range: "*",
    ...extra,
  };
}

function vuln(name: string, severity: string, via: unknown[]): Vuln {
  return {
    name,
    severity,
    isDirect: false,
    via,
    effects: [],
    range: "*",
    nodes: [`node_modules/${name}`],
    fixAvailable: false,
  };
}

/** A report with npm's per-severity counts filled in from the entries. */
function report(vulns: Vuln[]) {
  const counts: Record<string, number> = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const v of vulns) {
    if (typeof v.severity === "string" && v.severity in counts) counts[v.severity]++;
  }
  const severityCounts: Record<string, number> = { ...counts, total: vulns.length };
  return {
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(vulns.map((v) => [v.name as string, v])),
    metadata: {
      vulnerabilities: severityCounts,
      dependencies: { prod: 1, dev: 1, optional: 0, peer: 0, peerOptional: 0, total: 2 },
    },
  };
}

/** The real 2026-10-07 chain: eslint-config-next -> ... -> braces. */
function bracesChain(): Vuln[] {
  return [
    vuln("@next/eslint-plugin-next", "high", ["fast-glob"]),
    vuln("braces", "high", [advisory("braces", BRACES)]),
    vuln("eslint-config-next", "high", ["@next/eslint-plugin-next"]),
    vuln("fast-glob", "high", ["micromatch"]),
    vuln("micromatch", "high", ["braces"]),
  ];
}

const entry = (id = BRACES, pkg = "braces", review_by = "2026-11-07") => ({
  id,
  package: pkg,
  reason: "dev-only lint toolchain path, no patched release, not in the production image",
  added: "2026-10-07",
  review_by,
});

const ALLOWLIST = [entry()];

describe("evaluateAudit", () => {
  it("allows the braces chain when its only root advisory is allow-listed", () => {
    const result = evaluateAudit(report(bracesChain()), ALLOWLIST, TODAY);
    expect(result.violations).toEqual([]);
    expect(result.allowed.map((a) => a.name)).toEqual([
      "@next/eslint-plugin-next",
      "braces",
      "eslint-config-next",
      "fast-glob",
      "micromatch",
    ]);
    for (const finding of result.allowed) {
      expect(finding.advisories.map((r) => r.id)).toEqual([BRACES]);
      expect(finding.entries).toEqual([ALLOWLIST[0]]);
    }
    expect(result.staleEntries).toEqual([]);
    expect(result.overdueEntries).toEqual([]);
  });

  it("fails a different HIGH advisory (sharp) alongside the allowed chain", () => {
    const result = evaluateAudit(
      report([...bracesChain(), vuln("sharp", "high", [advisory("sharp", SHARP)])]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations.map((v) => v.name)).toEqual(["sharp"]);
    expect(result.violations[0].advisories).toEqual([
      expect.objectContaining({ id: SHARP, package: "sharp", allowListed: false }),
    ]);
    expect(result.allowed).toHaveLength(5);
  });

  it("fails a CRITICAL advisory", () => {
    const result = evaluateAudit(
      report([vuln("evil", "critical", [advisory("evil", SOURCE_MAP_JS, "critical")])]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations.map((v) => [v.name, v.severity])).toEqual([["evil", "critical"]]);
  });

  it("fails a vulnerability with mixed roots: one allow-listed, one not", () => {
    // micromatch reaches braces (allow-listed) AND carries its own advisory.
    const vulns = bracesChain().map((v) =>
      v.name === "micromatch"
        ? vuln("micromatch", "high", ["braces", advisory("micromatch", SOURCE_MAP_JS)])
        : v,
    );
    const result = evaluateAudit(report(vulns), ALLOWLIST, TODAY);
    // micromatch and everything that depends on it now resolve to both roots.
    expect(result.violations.map((v) => v.name)).toEqual([
      "@next/eslint-plugin-next",
      "eslint-config-next",
      "fast-glob",
      "micromatch",
    ]);
    const micromatch = result.violations.find((v) => v.name === "micromatch");
    expect(micromatch?.advisories.map((r) => [r.id, r.allowListed]).sort()).toEqual([
      [SOURCE_MAP_JS, false],
      [BRACES, true],
    ].sort());
    expect(result.allowed.map((a) => a.name)).toEqual(["braces"]);
  });

  it("fails mixed roots reached through two different dependencies", () => {
    const result = evaluateAudit(
      report([
        vuln("braces", "high", [advisory("braces", BRACES)]),
        vuln("source-map-js", "high", [advisory("source-map-js", SOURCE_MAP_JS)]),
        vuln("toolchain", "high", ["braces", "source-map-js"]),
      ]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations.map((v) => v.name)).toEqual(["source-map-js", "toolchain"]);
  });

  it("ignores moderate, low and info vulnerabilities, as --audit-level=high did", () => {
    const result = evaluateAudit(
      report([
        vuln("postcss-selector-parser", "moderate", [advisory("postcss-selector-parser", "GHSA-rj75-hqrm-r3gf", "moderate")]),
        vuln("@tailwindcss/typography", "moderate", ["postcss-selector-parser"]),
        vuln("lowpkg", "low", [advisory("lowpkg", "GHSA-aaaa-bbbb-cccc", "low")]),
        vuln("infopkg", "info", [advisory("infopkg", "GHSA-dddd-eeee-ffff", "info")]),
        // Even an unresolvable one is not gated below high.
        vuln("weird-moderate", "moderate", ["does-not-exist"]),
      ]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations).toEqual([]);
    expect(result.allowed).toEqual([]);
  });

  it("terminates on a cycle in via and still finds the root", () => {
    const result = evaluateAudit(
      report([
        vuln("a", "high", ["b"]),
        vuln("b", "high", ["a", "braces"]),
        vuln("braces", "high", [advisory("braces", BRACES)]),
      ]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations).toEqual([]);
    expect(result.allowed.map((a) => a.name)).toEqual(["a", "b", "braces"]);
  });

  it("fails a cycle that never reaches an advisory", () => {
    const result = evaluateAudit(
      report([vuln("a", "high", ["b"]), vuln("b", "high", ["a"])]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations.map((v) => v.name)).toEqual(["a", "b"]);
    expect(result.violations[0].problems).toEqual(['"a" resolves to no advisory']);
  });

  it("fails closed when a via name has no entry in the report", () => {
    const vulns = bracesChain().map((v) => (v.name === "micromatch" ? vuln("micromatch", "high", ["braces", "ghost"]) : v));
    const result = evaluateAudit(report(vulns), ALLOWLIST, TODAY);
    const micromatch = result.violations.find((v) => v.name === "micromatch");
    expect(micromatch?.problems).toEqual(['"ghost" is named in via but has no entry in the audit report']);
    expect(result.allowed.map((a) => a.name)).toEqual(["braces"]);
  });

  it("fails closed on an advisory with no GHSA id in url or source", () => {
    const result = evaluateAudit(
      report([
        vuln("braces", "high", [
          advisory("braces", BRACES),
          { ...advisory("braces", BRACES), url: "https://example.invalid/advisory/1", source: 1234 },
        ]),
      ]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations.map((v) => v.name)).toEqual(["braces"]);
    expect(result.violations[0].advisories.map((r) => r.id)).toEqual([BRACES, null]);
  });

  it("fails closed on an empty via, a non-object via item and an unknown severity", () => {
    const result = evaluateAudit(
      report([
        vuln("empty", "high", []),
        vuln("odd", "high", [42]),
        vuln("shouty", "HIGH", [advisory("shouty", BRACES)]),
      ]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations.map((v) => v.name)).toEqual(["empty", "odd", "shouty"]);
    expect(result.violations[2].problems).toEqual(['unrecognised severity "HIGH"']);
  });

  it("requires the package to match too, not just the GHSA id", () => {
    const result = evaluateAudit(
      report([vuln("not-braces", "high", [advisory("not-braces", BRACES)])]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations.map((v) => v.name)).toEqual(["not-braces"]);
  });

  it("takes the GHSA id from source when the url has none, case-insensitively", () => {
    const result = evaluateAudit(
      report([vuln("braces", "high", [{ ...advisory("braces", BRACES), url: null, source: "ghsa-VFJ7-8cjw-p6xm" }])]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.violations).toEqual([]);
    expect(result.allowed.map((a) => a.name)).toEqual(["braces"]);
  });

  it("with an empty allow-list, the braces chain fails exactly as --audit-level=high did", () => {
    const result = evaluateAudit(report(bracesChain()), [], TODAY);
    expect(result.violations).toHaveLength(5);
    expect(result.allowed).toEqual([]);
  });

  it("reports an allow-list entry as stale once its advisory is gone from the report", () => {
    const result = evaluateAudit(
      report([vuln("sharp", "high", [advisory("sharp", SHARP)])]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.staleEntries).toEqual([ALLOWLIST[0]]);
    // A stale entry never turns a violation into a pass.
    expect(result.violations.map((v) => v.name)).toEqual(["sharp"]);
  });

  it("does not report an entry as stale while its advisory is still present at any severity", () => {
    const result = evaluateAudit(
      report([vuln("braces", "moderate", [advisory("braces", BRACES, "moderate")])]),
      ALLOWLIST,
      TODAY,
    );
    expect(result.staleEntries).toEqual([]);
  });

  it("reports an entry as overdue only after its review_by date, and still allows it", () => {
    const onTheDay = evaluateAudit(report(bracesChain()), ALLOWLIST, "2026-11-07");
    expect(onTheDay.overdueEntries).toEqual([]);

    const dayAfter = evaluateAudit(report(bracesChain()), ALLOWLIST, "2026-11-08");
    expect(dayAfter.overdueEntries).toEqual([ALLOWLIST[0]]);
    expect(dayAfter.violations).toEqual([]); // overdue warns, it does not fail

    const asDate = evaluateAudit(report(bracesChain()), ALLOWLIST, new Date("2026-12-01T00:00:00Z"));
    expect(asDate.overdueEntries).toEqual([ALLOWLIST[0]]);
  });

  it("refuses a malformed audit report instead of reading it as clean", () => {
    expect(() => evaluateAudit({}, ALLOWLIST, TODAY)).toThrow(/report version/);
    expect(() => evaluateAudit({ auditReportVersion: 2 }, ALLOWLIST, TODAY)).toThrow(/vulnerabilities/);
    const lying = report(bracesChain());
    expect(assertAuditReport(lying)).toBe(lying);
    lying.metadata.vulnerabilities.high = 9;
    expect(() => assertAuditReport(lying)).toThrow(/inconsistent/);
    expect(() => evaluateAudit(lying, ALLOWLIST, TODAY)).toThrow(/inconsistent/);
    expect(() => evaluateAudit(report([]), ALLOWLIST, "07/10/2026")).toThrow(/today/);
  });
});

describe("productionExposedEntries (the dev-only premise)", () => {
  it("returns the entry when the production-only report lists its advisory", () => {
    // `npm audit --omit=dev` once micromatch -> braces is a production dependency.
    const prod = report([
      vuln("braces", "high", [advisory("braces", BRACES)]),
      vuln("micromatch", "high", ["braces"]),
    ]);
    expect(productionExposedEntries(prod, ALLOWLIST)).toEqual([ALLOWLIST[0]]);
  });

  it("returns nothing when the advisory stays in the dev tree", () => {
    expect(productionExposedEntries(report([]), ALLOWLIST)).toEqual([]);
    const prodOther = report([vuln("sharp", "high", [advisory("sharp", SHARP)])]);
    expect(productionExposedEntries(prodOther, ALLOWLIST)).toEqual([]);
  });

  it("matches at any severity, on the GHSA id alone: under another package, or none, it is still exposed", () => {
    const moderate = report([vuln("braces", "moderate", [advisory("braces", BRACES, "moderate")])]);
    expect(productionExposedEntries(moderate, ALLOWLIST)).toEqual([ALLOWLIST[0]]);
    // An advisory record whose package changed between the two audits must not read as absent.
    const otherPackage = report([vuln("not-braces", "high", [advisory("not-braces", BRACES)])]);
    expect(productionExposedEntries(otherPackage, ALLOWLIST)).toEqual([ALLOWLIST[0]]);
    const unnamed = report([vuln("braces", "high", [{ ...advisory("braces", BRACES), name: undefined }])]);
    expect(productionExposedEntries(unnamed, ALLOWLIST)).toEqual([ALLOWLIST[0]]);
    const otherId = report([vuln("braces", "high", [advisory("braces", SHARP)])]);
    expect(productionExposedEntries(otherId, ALLOWLIST)).toEqual([]);
    expect(productionExposedEntries(report([vuln("braces", "high", [advisory("braces", BRACES)])]), [])).toEqual([]);
  });

  it("refuses a malformed report or allow-list instead of reading it as clean", () => {
    expect(() => productionExposedEntries({}, ALLOWLIST)).toThrow(/report version/);
    const lying = report([vuln("braces", "high", [advisory("braces", BRACES)])]);
    lying.metadata.vulnerabilities.high = 0;
    expect(() => productionExposedEntries(lying, ALLOWLIST)).toThrow(/inconsistent/);
    expect(() => productionExposedEntries(report([]), [{ id: BRACES }])).toThrow(/audit allow-list/);
  });

  it("formats an exposed entry as an error, and none as a plain line", () => {
    expect(formatProductionCheck([])).toEqual([
      "npm audit gate: no allow-listed advisory reaches a production dependency (npm audit --omit=dev).",
    ]);
    const [line, ...rest] = formatProductionCheck([ALLOWLIST[0]]);
    expect(rest).toEqual([]);
    expect(line).toMatch(/^::error::npm audit: allow-listed GHSA-vfj7-8cjw-p6xm \(braces\) now reaches a production dependency/);
    expect(line).toContain("the dev-only exception no longer holds");
  });
});

describe("validateAllowlist", () => {
  it("accepts the empty list and a well-formed entry", () => {
    expect(validateAllowlist([])).toEqual([]);
    expect(validateAllowlist(ALLOWLIST)).toEqual(ALLOWLIST);
  });

  it.each([
    ["not an array", { id: BRACES }],
    ["a non-object entry", ["GHSA-vfj7-8cjw-p6xm"]],
    ["a bad id", [{ ...entry(), id: "CVE-2026-1234" }]],
    ["a missing package", [{ ...entry(), package: "" }]],
    ["a blank reason", [{ ...entry(), reason: "   " }]],
    ["an impossible date", [{ ...entry(), review_by: "2026-02-30" }]],
    ["review_by not after added", [{ ...entry(), review_by: "2026-10-07" }]],
    ["an unknown field", [{ ...entry(), allowAll: true }]],
    ["a duplicate id (ids compare case-insensitively)", [entry(), entry("GHSA-VFJ7-8CJW-P6XM")]],
  ])("rejects %s", (_label, value) => {
    expect(() => validateAllowlist(value)).toThrow(/audit allow-list/);
  });

  it("the committed scripts/audit-allowlist.json is valid", () => {
    const file = JSON.parse(readFileSync(resolve(__dirname, "audit-allowlist.json"), "utf8"));
    expect(validateAllowlist(file)).toEqual(file);
    // GHSA-vfj7-8cjw-p6xm (braces) was withdrawn by GitHub; its entry was removed on 2026-10-24.
    expect(file.map((e: { id: string }) => e.id)).not.toContain(BRACES);
  });

  it(`only ${PICOMATCH} carries ${OPTIONAL_PEER_FIELD}, with exactly better-auth > vitest`, () => {
    // Pinned against widening: a new (from, peer) edge, or the field on another
    // entry, needs a reviewed change to this test as well as to the allow-list.
    const file = JSON.parse(readFileSync(resolve(__dirname, "audit-allowlist.json"), "utf8"));
    const fielded = file.filter((e: Record<string, unknown>) => Object.hasOwn(e, OPTIONAL_PEER_FIELD));
    expect(fielded.map((e: { id: string; package: string }) => [e.id, e.package])).toEqual([[PICOMATCH, "picomatch"]]);
    expect(fielded[0][OPTIONAL_PEER_FIELD]).toEqual([{ from: "better-auth", peer: "vitest" }]);
  });
});

describe("advisoryGhsaId", () => {
  it("reads the id from the url, from source, and refuses two different ids", () => {
    expect(advisoryGhsaId(advisory("braces", BRACES))).toBe(BRACES);
    expect(advisoryGhsaId({ source: BRACES })).toBe(BRACES);
    expect(advisoryGhsaId({ url: `https://github.com/advisories/${BRACES}`, source: SHARP })).toBeNull();
    expect(advisoryGhsaId({ url: "https://example.invalid", source: 1 })).toBeNull();
  });
});

describe("parseAuditOutput", () => {
  const good = JSON.stringify(report(bracesChain()));

  it("returns the report for valid output, whatever npm's exit status", () => {
    expect(parseAuditOutput({ status: 1, stdout: good, stderr: "" })).toEqual({
      kind: "report",
      report: JSON.parse(good),
    });
  });

  it("recognises the endpoint error in stdout or stderr", () => {
    const stdout = JSON.stringify({ message: "503 Service Unavailable", statusCode: 503, body: "x" });
    expect(parseAuditOutput({ status: 1, stdout, stderr: `npm error ${ENDPOINT_ERROR_MARKER}` })).toEqual({
      kind: "endpoint-error",
      detail: `${ENDPOINT_ERROR_MARKER} (status 503: 503 Service Unavailable)`,
    });
    expect(parseAuditOutput({ status: 1, stdout: ENDPOINT_ERROR_MARKER, stderr: "" }).kind).toBe("endpoint-error");
  });

  it("treats anything else as invalid — never as a clean report", () => {
    expect(parseAuditOutput({ status: 1, stdout: "", stderr: "boom" }).kind).toBe("invalid");
    expect(parseAuditOutput({ status: 1, stdout: "{not json", stderr: "" }).kind).toBe("invalid");
    expect(
      parseAuditOutput({ status: 1, stdout: JSON.stringify({ error: { code: "ENOLOCK", summary: "no lockfile" } }) }),
    ).toEqual({ kind: "invalid", detail: "npm audit failed: ENOLOCK no lockfile" });
    expect(parseAuditOutput({ status: 0, stdout: "{}" }).kind).toBe("invalid");
    expect(parseAuditOutput({ status: null, error: new Error("spawn npm ENOENT") })).toEqual({
      kind: "invalid",
      detail: "could not run npm audit: spawn npm ENOENT",
    });
  });

  it("masks credentials in a registry URL that npm echoes back", () => {
    const url = "https://ci-user:s3cret-token@registry.example.invalid/-/npm/v1/security/advisories/bulk";
    const stdout = JSON.stringify({ message: `503 Service Unavailable - POST ${url}`, statusCode: 503 });
    const down = parseAuditOutput({ status: 1, stdout, stderr: `npm error ${ENDPOINT_ERROR_MARKER}` });
    expect(down.kind).toBe("endpoint-error");
    expect(JSON.stringify(down)).not.toContain("s3cret-token");
    expect(JSON.stringify(down)).toContain("https://***@registry.example.invalid/");
    const failed = parseAuditOutput({
      status: 1,
      stdout: JSON.stringify({ error: { code: "E401", summary: `Unable to authenticate, ${url}` } }),
    });
    expect(failed.kind).toBe("invalid");
    expect(JSON.stringify(failed)).not.toContain("s3cret-token");
    expect(JSON.stringify(parseAuditOutput({ status: null, error: new Error(`fetch ${url}`) }))).not.toContain(
      "s3cret-token",
    );
  });

  it("redactUrlCredentials leaves URLs without credentials alone", () => {
    const plain = "POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk and https://github.com/advisories/x";
    expect(redactUrlCredentials(plain)).toBe(plain);
    expect(redactUrlCredentials("https://tok@host/a https://u:p@other/b")).toBe("https://***@host/a https://***@other/b");
  });
});

describe("formatResult / annotation", () => {
  it("prints allowed findings as notices with the reason, violations as errors with advisory URLs", () => {
    const result = evaluateAudit(
      report([...bracesChain(), vuln("sharp", "high", [advisory("sharp", SHARP)])]),
      ALLOWLIST,
      TODAY,
    );
    const lines = formatResult(result);
    const notices = lines.filter((l) => l.startsWith("::notice::"));
    const errors = lines.filter((l) => l.startsWith("::error::"));
    expect(notices).toHaveLength(5);
    expect(notices.every((l) => l.includes(ALLOWLIST[0].reason) && l.includes(BRACES))).toBe(true);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("sharp (high)");
    expect(errors[0]).toContain(`https://github.com/advisories/${SHARP}`);
    expect(errors[1]).toContain("1 HIGH or CRITICAL vulnerability not covered");
  });

  it("prints overdue and stale entries as warnings", () => {
    const overdue = { ...entry(), added: "2026-09-01", review_by: "2026-10-01" };
    const lines = formatResult(evaluateAudit(report([]), [overdue], TODAY));
    const warnings = lines.filter((l) => l.startsWith("::warning::"));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("passed its review date 2026-10-01");
    expect(warnings[1]).toContain("no longer appears in npm audit");
  });

  it("escapes newlines and % so a message cannot inject another workflow command", () => {
    expect(annotation("error", "50% done\n::set-output name=x::y\r")).toBe(
      "::error::50%25 done%0A::set-output name=x::y%0D",
    );
  });
});

describe("runGate", () => {
  const harnessReads: string[] = [];
  const goodRun = (vulns: Vuln[]) => ({ status: 1, stdout: JSON.stringify(report(vulns)), stderr: "" });
  const endpointDown = { status: 1, stdout: "{}", stderr: `npm error ${ENDPOINT_ERROR_MARKER}` };

  /** Each audit call takes the next run; the last one repeats. */
  function harness(runs: Array<Record<string, unknown>>, allowlist: unknown = ALLOWLIST) {
    const lines: string[] = [];
    const sleeps: number[] = [];
    const args: string[][] = [];
    const exit = runGate({
      // No fixture here carries production_via_optional_peer, so the gate must never read a project file.
      readProjectFile: (name: string) => {
        harnessReads.push(name);
        throw new Error("harness: no project files");
      },
      runAudit: (a: readonly string[]) => {
        args.push([...a]);
        return runs[Math.min(args.length - 1, runs.length - 1)] as never;
      },
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      print: (line: string) => lines.push(line),
      allowlist,
      today: TODAY,
    });
    return { exit, lines, sleeps, args, calls: () => args.length };
  }

  afterEach(() => {
    // Laziness: no harness run here carries the field, so none may read a project file.
    expect(harnessReads.splice(0)).toEqual([]);
  });

  /** The real braces chain as `npm audit --omit=dev` lists it once braces is a prod dependency. */
  const prodBraces = () => goodRun([vuln("braces", "high", [advisory("braces", BRACES)]), vuln("micromatch", "high", ["braces"])]);

  it("passes the allow-listed chain once the production tree is clean (exit 0)", async () => {
    const h = harness([goodRun(bracesChain()), goodRun([])]);
    expect(await h.exit).toBe(EXIT_PASS);
    expect(h.lines.filter((l) => l.startsWith("::notice::"))).toHaveLength(5);
    expect(h.args).toEqual([[...NPM_AUDIT_ARGS], [...NPM_AUDIT_PROD_ARGS]]);
    expect(h.lines.at(-1)).toBe(
      "npm audit gate: no allow-listed advisory reaches a production dependency (npm audit --omit=dev).",
    );
  });

  it("FAILS when an allow-listed advisory reaches a production dependency (exit 1)", async () => {
    // Every gate passed this before: micromatch@4.0.8 added to dependencies made
    // braces a production dependency, and the allow-list still matched.
    const h = harness([goodRun(bracesChain()), prodBraces()]);
    expect(await h.exit).toBe(EXIT_VIOLATION);
    expect(h.calls()).toBe(2);
    const errors = h.lines.filter((l) => l.startsWith("::error::"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`allow-listed ${BRACES} (braces) now reaches a production dependency`);
  });

  it.each([
    ["under another package", (a: Record<string, unknown>) => ({ ...a, name: "not-braces" })],
    ["with no package name", (a: Record<string, unknown>) => ({ ...a, name: undefined })],
  ])("FAILS when the production audit files the allow-listed id %s (exit 1)", async (_label, change) => {
    const prod = goodRun([vuln("braces", "high", [change(advisory("braces", BRACES))]), vuln("micromatch", "high", ["braces"])]);
    const h = harness([goodRun(bracesChain()), prod]);
    expect(await h.exit).toBe(EXIT_VIOLATION);
    expect(h.lines.filter((l) => l.startsWith("::error::"))).toEqual([formatProductionCheck([ALLOWLIST[0]])[0]]);
    expect(h.lines.some((l) => l.startsWith("::warning::"))).toBe(false);
  });

  it("skips the production audit when no allow-list entry is in use", async () => {
    const clean = harness([goodRun([]), prodBraces()]);
    expect(await clean.exit).toBe(EXIT_PASS);
    expect(clean.args).toEqual([[...NPM_AUDIT_ARGS]]);

    const failing = harness([goodRun([...bracesChain(), vuln("sharp", "high", [advisory("sharp", SHARP)])]), goodRun([])]);
    expect(await failing.exit).toBe(EXIT_VIOLATION);
    expect(failing.calls()).toBe(1);
  });

  it(`retries the production audit's endpoint error too, then FAILS — never passes`, async () => {
    const h = harness([goodRun(bracesChain()), endpointDown]);
    expect(await h.exit).toBe(EXIT_UNVERIFIED);
    expect(h.calls()).toBe(1 + MAX_ATTEMPTS);
    expect(h.args.slice(1)).toEqual(Array(MAX_ATTEMPTS).fill([...NPM_AUDIT_PROD_ARGS]));
    expect(h.lines.at(-1)).toMatch(/^::error::npm audit --omit=dev endpoint unavailable after 3 attempts/);
  });

  it("fails when the production audit's output is not a valid report", async () => {
    const h = harness([goodRun(bracesChain()), { status: 1, stdout: "{}", stderr: "" }]);
    expect(await h.exit).toBe(EXIT_UNVERIFIED);
    expect(h.calls()).toBe(2);
  });

  it("fails a violation (exit 1)", async () => {
    const h = harness([goodRun([vuln("sharp", "high", [advisory("sharp", SHARP)])])]);
    expect(await h.exit).toBe(EXIT_VIOLATION);
  });

  it(`retries an endpoint error, ${MAX_ATTEMPTS} attempts in all, then FAILS — never passes`, async () => {
    const h = harness([endpointDown]);
    expect(await h.exit).toBe(EXIT_UNVERIFIED);
    expect(h.calls()).toBe(MAX_ATTEMPTS);
    expect(h.args).toEqual(Array(MAX_ATTEMPTS).fill([...NPM_AUDIT_ARGS]));
    expect(h.sleeps).toEqual(Array(MAX_ATTEMPTS - 1).fill(RETRY_DELAY_MS));
    expect(h.lines.at(-1)).toMatch(/^::error::npm audit endpoint unavailable after 3 attempts/);
  });

  it("uses the report once the endpoint recovers", async () => {
    const h = harness([endpointDown, endpointDown, goodRun([vuln("sharp", "high", [advisory("sharp", SHARP)])])]);
    expect(await h.exit).toBe(EXIT_VIOLATION);
    expect(h.calls()).toBe(3);
  });

  it("does not retry other failures, and fails them", async () => {
    const h = harness([{ status: 1, stdout: "", stderr: "npm error code ENOLOCK" }, goodRun([])]);
    expect(await h.exit).toBe(EXIT_UNVERIFIED);
    expect(h.calls()).toBe(1);
  });

  it("fails before auditing when the allow-list is invalid", async () => {
    const h = harness([goodRun([])], [{ id: BRACES }]);
    expect(await h.exit).toBe(EXIT_UNVERIFIED);
    expect(h.calls()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// production_via_optional_peer: the lockfile proof
//
// The fixture copies the real paths and dev flags of mp-charts' lockfile
// (2026-11-17): better-auth declares vitest as an OPTIONAL peer, so npm marks
// vitest and everything under it devOptional, and `npm audit --omit=dev` lists
// picomatch at three nested paths. Mutants are deep copies with the flags npm
// would write set by hand.
// ---------------------------------------------------------------------------

// Fixture lockfiles are mutated freely (including into malformed shapes), so they stay untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LockNode = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Lock = Record<string, any> & { packages: Record<string, LockNode> };
/** Every field of every ProofResult kind, for assertions. */
type Proof = {
  kind: "proven" | "exposed" | "unprovable";
  targets: string[];
  nodes: string[];
  paths: string[];
  witnesses: string[];
  reasons: string[];
  problems: string[];
};

const OPT = { optional: true };
const PICO_NESTED = [
  "node_modules/tinyglobby/node_modules/picomatch",
  "node_modules/vite/node_modules/picomatch",
  "node_modules/vitest/node_modules/picomatch",
];
const PICO_ADVISORY = advisory("picomatch", PICOMATCH, "high", {
  source: 1247710,
  title: "picomatch vulnerable to ReDoS through single-branch repeated extglobs",
  range: "<=4.0.7",
});

const PICO_ENTRY = {
  id: PICOMATCH,
  package: "picomatch",
  reason: "dev tooling only; in --omit=dev only through better-auth's optional peer on vitest",
  added: "2026-11-17",
  review_by: "2026-12-17",
  [OPTIONAL_PEER_FIELD]: [{ from: "better-auth", peer: "vitest" }],
};

function fixtureLock(): Lock {
  return {
    name: "fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "fixture",
        version: "1.0.0",
        dependencies: { "better-auth": ">=1.7.18 <1.8.0", next: "16.4.5" },
        devDependencies: {
          "@vitejs/plugin-react": "^6.1.2",
          "@vitest/coverage-v8": "^5.0.5",
          "eslint-config-next": "^16.4.5",
          micromatch: "^4.0.8",
          vitest: "^5.0.5",
        },
      },
      "node_modules/better-auth": {
        version: "1.7.18",
        peerDependencies: { next: "^16.0.0", react: "^19.0.0", vitest: "^5.0.0" },
        peerDependenciesMeta: { next: OPT, react: OPT, vitest: OPT },
      },
      "node_modules/next": { version: "16.4.5", peerDependencies: { react: "^19.0.0" } },
      "node_modules/react": { version: "19.2.0" },
      "node_modules/vitest": {
        version: "5.1.0",
        devOptional: true,
        dependencies: { picomatch: "^4.0.7", tinyglobby: "^0.2.17" },
        peerDependencies: { "@vitest/coverage-v8": "5.1.0", vite: "^8.0.0" },
        peerDependenciesMeta: { "@vitest/coverage-v8": OPT, vite: { optional: false } },
      },
      "node_modules/vitest/node_modules/picomatch": { version: "4.0.7", devOptional: true },
      "node_modules/@vitest/coverage-v8": { version: "5.1.0", devOptional: true, peerDependencies: { vitest: "5.1.0" } },
      "node_modules/vite": {
        version: "8.3.6",
        devOptional: true,
        peer: true,
        dependencies: { picomatch: "^4.0.7", tinyglobby: "^0.2.17" },
      },
      "node_modules/vite/node_modules/picomatch": { version: "4.0.7", devOptional: true },
      "node_modules/tinyglobby": {
        version: "0.2.17",
        devOptional: true,
        dependencies: { fdir: "^6.5.0", picomatch: "^4.0.4" },
      },
      "node_modules/tinyglobby/node_modules/fdir": {
        version: "6.5.0",
        devOptional: true,
        peerDependencies: { picomatch: "^3 || ^4" },
        peerDependenciesMeta: { picomatch: OPT },
      },
      "node_modules/tinyglobby/node_modules/picomatch": { version: "4.0.7", devOptional: true },
      "node_modules/@vitejs/plugin-react": { version: "6.1.2", dev: true, peerDependencies: { vite: "^8.0.0" } },
      "node_modules/eslint-config-next": { version: "16.4.5", dev: true, dependencies: { "fast-glob": "^3.3.2" } },
      "node_modules/fast-glob": { version: "3.3.3", dev: true, dependencies: { micromatch: "^4.0.8" } },
      "node_modules/micromatch": { version: "4.0.8", dev: true, dependencies: { picomatch: "^2.3.1" } },
      "node_modules/picomatch": { version: "2.3.2", dev: true },
    },
  };
}

/** The package.json a lockfile's root was written from. */
function packageJsonFor(lock: Lock) {
  const root = lock.packages[""] ?? {};
  const pj: Record<string, unknown> = { name: "fixture", version: "1.0.0" };
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta"]) {
    if (root[key] !== undefined) pj[key] = root[key];
  }
  return pj;
}

/** A deep copy of the fixture with `change` applied to its packages. */
function mutant(change: (p: Record<string, LockNode>, lock: Lock) => void): Lock {
  const lock = structuredClone(fixtureLock());
  change(lock.packages, lock);
  return lock;
}

/** A vulnerability entry at explicit lockfile nodes. */
const vulnAt = (name: string, via: unknown[], nodes: string[], severity = "high") => ({ ...vuln(name, severity, via), nodes });

/** The real 6-entry `npm audit --omit=dev` output of 2026-11-17. */
function realProdVulns(): Vuln[] {
  return [
    vulnAt("@vitest/coverage-v8", ["vitest"], ["node_modules/@vitest/coverage-v8"]),
    vulnAt("fdir", ["picomatch"], ["node_modules/tinyglobby/node_modules/fdir"]),
    vulnAt("picomatch", [PICO_ADVISORY], [...PICO_NESTED]),
    vulnAt("tinyglobby", ["fdir", "picomatch"], ["node_modules/tinyglobby"]),
    vulnAt("vite", ["picomatch", "tinyglobby"], ["node_modules/vite"]),
    vulnAt("vitest", ["@vitest/coverage-v8", "picomatch", "tinyglobby", "vite"], ["node_modules/vitest"]),
  ];
}

/** The real full-tree `npm audit` output after the typescript-eslint 8.73 bump (18 entries). */
function realFullVulns(): Vuln[] {
  return [
    vuln("@next/eslint-plugin-next", "high", ["fast-glob"]),
    vuln("@typescript-eslint/eslint-plugin", "high", [
      "@typescript-eslint/parser",
      "@typescript-eslint/type-utils",
      "@typescript-eslint/utils",
    ]),
    vuln("@typescript-eslint/parser", "high", ["@typescript-eslint/typescript-estree"]),
    vuln("@typescript-eslint/type-utils", "high", ["@typescript-eslint/typescript-estree", "@typescript-eslint/utils"]),
    vuln("@typescript-eslint/typescript-estree", "high", ["tinyglobby"]),
    vuln("@typescript-eslint/utils", "high", ["@typescript-eslint/typescript-estree"]),
    vuln("@vitejs/plugin-react", "high", ["vite"]),
    vuln("eslint-config-next", "high", ["@next/eslint-plugin-next", "typescript-eslint"]),
    vuln("eslint-import-resolver-typescript", "high", ["tinyglobby"]),
    vuln("fast-glob", "high", ["micromatch"]),
    vuln("micromatch", "high", ["picomatch"]),
    vuln("typescript-eslint", "high", [
      "@typescript-eslint/eslint-plugin",
      "@typescript-eslint/parser",
      "@typescript-eslint/typescript-estree",
      "@typescript-eslint/utils",
    ]),
    ...realProdVulns().map((v) =>
      v.name === "picomatch" ? { ...v, nodes: ["node_modules/picomatch", ...PICO_NESTED] } : v,
    ),
  ];
}

/** Runs the proof on a lockfile the way runGate does, minus the I/O. */
function prove(lock: Lock, entry: Record<string, unknown> = PICO_ENTRY, vulns: Vuln[] = realProdVulns()) {
  const packages = assertProjectFiles(lock, packageJsonFor(lock));
  const production = checkProductionModel(packages);
  return proveOptionalPeerOnly(entry as never, report(vulns), packages, production) as unknown as Proof;
}

/** A reader serving only the two project files, recording every request. */
function projectReader(lock: unknown = fixtureLock(), pj: unknown = packageJsonFor(typeof lock === "string" ? fixtureLock() : (lock as Lock))) {
  const reads: string[] = [];
  const read = (name: string) => {
    reads.push(name);
    if (name === "package-lock.json") return typeof lock === "string" ? lock : JSON.stringify(lock);
    if (name === "package.json") return typeof pj === "string" ? pj : JSON.stringify(pj);
    throw new Error(`refusing to read ${name}`);
  };
  return { read, reads };
}

/** runGate over a full and a production report, with project files. */
async function fieldGate(
  fullVulns: Vuln[],
  prodVulns: Vuln[],
  allowlist: unknown[] = [PICO_ENTRY],
  readProjectFile?: (name: string) => string,
) {
  const lines: string[] = [];
  const args: string[][] = [];
  const runs = [fullVulns, prodVulns];
  const exit = await runGate({
    runAudit: (a: readonly string[]) => {
      args.push([...a]);
      return { status: 1, stdout: JSON.stringify(report(runs[Math.min(args.length - 1, 1)])), stderr: "" };
    },
    sleep: async () => {},
    print: (line: string) => lines.push(line),
    allowlist,
    today: "2026-11-17",
    ...(readProjectFile ? { readProjectFile } : {}),
  });
  return { exit, lines, args };
}

describe(`validateAllowlist: ${OPTIONAL_PEER_FIELD}`, () => {
  it("accepts the picomatch entry and a scoped pair; entries without the field are unchanged", () => {
    expect(validateAllowlist([PICO_ENTRY])).toEqual([PICO_ENTRY]);
    const scoped = { ...PICO_ENTRY, [OPTIONAL_PEER_FIELD]: [{ from: "@scope/a", peer: "@b/c" }] };
    expect(validateAllowlist([scoped])).toEqual([scoped]);
    expect(validateAllowlist([entry(), PICO_ENTRY])).toHaveLength(2);
  });

  const edge = (from: unknown, peer: unknown = "vitest") => ({ from, peer });
  const withField = (value: unknown, extra: Record<string, unknown> = {}) => [
    { ...PICO_ENTRY, ...extra, [OPTIONAL_PEER_FIELD]: value },
  ];

  it.each([
    ["the field as null", withField(null)],
    ["the field as []", withField([])],
    ["the field as a string", withField("x")],
    ["the field as an object", withField({})],
    ["5 edges", withField(["a", "b", "c", "d", "e"].map((n) => edge(n)))],
    ["an edge as a string", withField(["better-auth>vitest"])],
    ["an edge with no peer", withField([{ from: "better-auth" }])],
    ["an edge with an extra key (optional)", withField([{ ...edge("better-auth"), optional: true }])],
    ["an edge with an extra key (path)", withField([{ ...edge("better-auth"), path: "node_modules/better-auth" }])],
    ["an edge with an extra key (all)", withField([{ ...edge("better-auth"), all: true }])],
    ["an uppercase name", withField([edge("Better-Auth")])],
    ["a name with whitespace", withField([edge("vit est")])],
    ["a relative path", withField([edge("../x")])],
    ["a node_modules path", withField([edge("node_modules/x")])],
    ["a name containing node_modules", withField([edge("x-node_modules")])],
    ["an empty name", withField([edge("")])],
    ["a name with ..", withField([edge("a..b")])],
    ["a name with >", withField([edge("better-auth", "vite>picomatch")])],
    ["a name with *", withField([edge("*")])],
    ["a leading . or _", withField([edge(".bin"), edge("_x")])],
    ["a 215-character name", withField([edge("a".repeat(215))])],
    ["a non-string name", withField([edge(42)])],
    ["from === peer", withField([edge("vitest", "vitest")])],
    ["from === package", withField([edge("picomatch", "vitest")])],
    ["a duplicate pair", withField([edge("better-auth"), edge("better-auth")])],
    ["review_by 46 days after added", withField([edge("better-auth")], { review_by: "2027-01-02" })],
  ])("rejects %s", (_label, value) => {
    expect(() => validateAllowlist(value)).toThrow(/audit allow-list entry 0 \(GHSA-fc5q-39xc-vjpf\)/);
  });

  it("accepts review_by exactly 45 days after added, and a 214-character name", () => {
    expect(() => validateAllowlist(withField([edge("better-auth")], { review_by: "2027-01-01" }))).not.toThrow();
    expect(() => validateAllowlist(withField([edge("a".repeat(214))]))).not.toThrow();
  });

  it("an invalid field stops the gate before any audit (exit 2)", async () => {
    const { exit, args, lines } = await fieldGate([], [], withField([]));
    expect(exit).toBe(EXIT_UNVERIFIED);
    expect(args).toEqual([]);
    expect(lines.at(-1)).toMatch(/could not verify advisories\.$/);
  });
});

describe("resolveDep / reachProduction (Arborist's Node.resolve)", () => {
  it("a nested copy shadows the hoisted one", () => {
    const p = fixtureLock().packages;
    expect(resolveDep(p, "node_modules/vitest", "picomatch")).toBe("node_modules/vitest/node_modules/picomatch");
    expect(resolveDep(p, "node_modules/micromatch", "picomatch")).toBe("node_modules/picomatch");
    expect(resolveDep(p, "", "picomatch")).toBe("node_modules/picomatch");
    expect(resolveDep(p, "", "nope")).toBeNull();
  });

  it("walks up scoped nested paths", () => {
    const p = {
      "": {},
      "node_modules/@s/a": {},
      "node_modules/@s/a/node_modules/@t/b": {},
      "node_modules/@s/a/node_modules/d": {},
      "node_modules/c": {},
    };
    expect(resolveDep(p, "node_modules/@s/a/node_modules/@t/b", "d")).toBe("node_modules/@s/a/node_modules/d");
    expect(resolveDep(p, "node_modules/@s/a/node_modules/@t/b", "c")).toBe("node_modules/c");
    expect(resolveDep(p, "node_modules/@s/a", "@t/b")).toBe("node_modules/@s/a/node_modules/@t/b");
    expect(resolveDep(p, "node_modules/c", "@t/b")).toBeNull();
  });

  it("resolves a peer from the node itself first, then its ancestors (not from its parent's view)", () => {
    const p = fixtureLock().packages;
    expect(resolveDep(p, "node_modules/tinyglobby/node_modules/fdir", "picomatch")).toBe(
      "node_modules/tinyglobby/node_modules/picomatch",
    );
    p["node_modules/tinyglobby/node_modules/fdir/node_modules/picomatch"] = { version: "4.0.7" };
    expect(resolveDep(p, "node_modules/tinyglobby/node_modules/fdir", "picomatch")).toBe(
      "node_modules/tinyglobby/node_modules/fdir/node_modules/picomatch",
    );
  });

  it("terminates on a cycle a -> b -> a, and never follows devDependencies", () => {
    const p = {
      "": { dependencies: { a: "1" }, devDependencies: { d: "1" } },
      "node_modules/a": { dependencies: { b: "1" } },
      "node_modules/b": { dependencies: { a: "1" }, devDependencies: { d: "1" } },
      "node_modules/d": { dev: true },
    };
    const r = reachProduction(p);
    expect([...r.reached].sort()).toEqual(["", "node_modules/a", "node_modules/b"]);
    expect(r.pathTo("node_modules/b")).toBe("root -dep-> node_modules/a -dep-> node_modules/b");
  });

  it("ignores an unresolved optional or peerOptional edge, and throws on an unresolved required one", () => {
    const p: Record<string, LockNode> = {
      "": { dependencies: { a: "1" }, optionalDependencies: { gone: "1" } },
      "node_modules/a": { peerDependencies: { x: "1" }, peerDependenciesMeta: { x: OPT } },
    };
    expect(reachProduction(p).reached.size).toBe(2);
    p["node_modules/a"].peerDependencies.y = "1";
    expect(() => reachProduction(p)).toThrow(/node_modules\/a requires y, which does not resolve/);
  });

  it("the fixture's model matches its dev flags exactly", () => {
    const packages = assertProjectFiles(fixtureLock(), packageJsonFor(fixtureLock()));
    const production = checkProductionModel(packages);
    expect(production.reached.has("node_modules/vitest")).toBe(true);
    expect(production.reached.has("node_modules/picomatch")).toBe(false);
    expect(packageNodes(packages, "picomatch").sort()).toEqual(["node_modules/picomatch", ...PICO_NESTED].sort());
  });
});

describe("proveOptionalPeerOnly", () => {
  it("proves the fixture: picomatch is in production only through better-auth > vitest", () => {
    const result = prove(fixtureLock());
    expect(result.kind).toBe("proven");
    expect([...result.targets].sort()).toEqual(PICO_NESTED);
    expect(result.nodes).toEqual(PICO_NESTED);
    expect(result.paths).toHaveLength(3);
    for (const path of result.paths) {
      expect(path).toMatch(/^root -dep-> node_modules\/better-auth -peerOptional-> node_modules\/vitest /);
    }
  });

  describe("exposed (exit 1) with witnesses", () => {
    it.each([
      [
        "micromatch made a root dependency",
        (p: Record<string, LockNode>) => {
          p[""].dependencies.micromatch = "^4.0.8";
          delete p[""].devDependencies.micromatch;
          delete p["node_modules/micromatch"].dev;
          delete p["node_modules/picomatch"].dev;
        },
        "root -dep-> node_modules/micromatch -dep-> node_modules/picomatch",
      ],
      [
        "tinyglobby made a root dependency",
        (p: Record<string, LockNode>) => {
          p[""].dependencies.tinyglobby = "^0.2.17";
        },
        "root -dep-> node_modules/tinyglobby -dep-> node_modules/tinyglobby/node_modules/picomatch",
      ],
      [
        "@vitejs/plugin-react moved to dependencies",
        (p: Record<string, LockNode>) => {
          p[""].dependencies["@vitejs/plugin-react"] = "^6.1.2";
          delete p[""].devDependencies["@vitejs/plugin-react"];
          delete p["node_modules/@vitejs/plugin-react"].dev;
        },
        "root -dep-> node_modules/@vitejs/plugin-react -peer-> node_modules/vite -dep-> node_modules/vite/node_modules/picomatch",
      ],
      [
        "next declaring vitest as an optional peer",
        (p: Record<string, LockNode>) => {
          p["node_modules/next"].peerDependencies.vitest = "^5.0.0";
          p["node_modules/next"].peerDependenciesMeta = { vitest: OPT };
        },
        "root -dep-> node_modules/next -peerOptional-> node_modules/vitest",
      ],
      [
        "better-auth gaining an optional peer that depends on picomatch",
        (p: Record<string, LockNode>) => {
          p["node_modules/better-auth"].peerDependencies["fake-tool"] = "^1.0.0";
          p["node_modules/better-auth"].peerDependenciesMeta["fake-tool"] = OPT;
          p["node_modules/fake-tool"] = { version: "1.0.0", optional: true, dependencies: { picomatch: "^4.0.0" } };
          p["node_modules/fake-tool/node_modules/picomatch"] = { version: "4.0.7", optional: true };
        },
        "-peerOptional-> node_modules/fake-tool -dep-> node_modules/fake-tool/node_modules/picomatch",
      ],
      [
        "a nested picomatch under a production package",
        (p: Record<string, LockNode>) => {
          p["node_modules/next"].dependencies = { picomatch: "^4.0.0" };
          p["node_modules/next/node_modules/picomatch"] = { version: "4.0.7" };
        },
        "root -dep-> node_modules/next -dep-> node_modules/next/node_modules/picomatch",
      ],
      [
        "an aliased picomatch (npm:picomatch) under a production package",
        (p: Record<string, LockNode>) => {
          p["node_modules/next"].dependencies = { pm: "npm:picomatch@^4.0.0" };
          p["node_modules/next/node_modules/pm"] = { name: "picomatch", version: "4.0.7" };
        },
        "root -dep-> node_modules/next -dep-> node_modules/next/node_modules/pm",
      ],
    ])("%s", (_label, change, witness) => {
      const result = prove(mutant(change));
      expect(result.kind).toBe("exposed");
      expect(result.witnesses.some((w: string) => w.includes(witness))).toBe(true);
      expect(result.reasons.join("\n")).toMatch(/is reachable from production dependencies without better-auth > vitest/);
    });
  });

  describe("exposed (exit 1): a broken premise", () => {
    const meta = (value: unknown) => (p: Record<string, LockNode>) => {
      if (value === undefined) delete p["node_modules/better-auth"].peerDependenciesMeta.vitest;
      else p["node_modules/better-auth"].peerDependenciesMeta.vitest = value;
    };
    it.each([
      ["vitest meta optional:false", meta({ optional: false }), PICO_ENTRY, /does not declare vitest as an optional peer/],
      ["no vitest meta", meta(undefined), PICO_ENTRY, /does not declare vitest as an optional peer/],
      ['vitest meta optional:"true"', meta({ optional: "true" }), PICO_ENTRY, /does not declare vitest as an optional peer/],
      [
        "vitest also in better-auth's dependencies",
        (p: Record<string, LockNode>) => {
          p["node_modules/better-auth"].dependencies = { vitest: "^5.0.0" };
        },
        PICO_ENTRY,
        /node_modules\/better-auth also lists vitest as a dependency/,
      ],
      [
        "the field naming better-auth > vite",
        () => {},
        { ...PICO_ENTRY, [OPTIONAL_PEER_FIELD]: [{ from: "better-auth", peer: "vite" }] },
        /node_modules\/better-auth does not declare vite as an optional peer/,
      ],
      [
        "an absent from",
        () => {},
        { ...PICO_ENTRY, [OPTIONAL_PEER_FIELD]: [{ from: "not-installed", peer: "vitest" }] },
        /not-installed is not in the production tree/,
      ],
      [
        "a nested production copy of better-auth without the peer",
        (p: Record<string, LockNode>) => {
          p[""].dependencies.x = "1.0.0";
          p["node_modules/x"] = { version: "1.0.0", dependencies: { "better-auth": "1.7.17" } };
          p["node_modules/x/node_modules/better-auth"] = { version: "1.7.17" };
        },
        PICO_ENTRY,
        /node_modules\/x\/node_modules\/better-auth does not declare vitest as an optional peer/,
      ],
      [
        "better-auth as an alias",
        (p: Record<string, LockNode>) => {
          p["node_modules/better-auth"].name = "evil";
        },
        PICO_ENTRY,
        /node_modules\/better-auth is installed as better-auth but is evil/,
      ],
      [
        "vitest deleted, so the edge does not resolve",
        (p: Record<string, LockNode>) => {
          for (const loc of ["node_modules/vitest", "node_modules/vitest/node_modules/picomatch", "node_modules/@vitest/coverage-v8"]) {
            delete p[loc];
          }
          delete p[""].devDependencies.vitest;
          delete p[""].devDependencies["@vitest/coverage-v8"];
          for (const loc of [
            "node_modules/vite",
            "node_modules/vite/node_modules/picomatch",
            "node_modules/tinyglobby",
            "node_modules/tinyglobby/node_modules/fdir",
            "node_modules/tinyglobby/node_modules/picomatch",
          ]) {
            delete p[loc].devOptional;
            p[loc].dev = true;
          }
        },
        PICO_ENTRY,
        /better-auth > vitest does not resolve to an installed production node/,
      ],
      [
        "better-auth reachable only through another excluded edge",
        (p: Record<string, LockNode>) => {
          delete p[""].dependencies["better-auth"];
          p["node_modules/next"].peerDependencies["better-auth"] = "^1.7.0";
          p["node_modules/next"].peerDependenciesMeta = { "better-auth": OPT };
        },
        {
          ...PICO_ENTRY,
          [OPTIONAL_PEER_FIELD]: [
            { from: "better-auth", peer: "vitest" },
            { from: "next", peer: "better-auth" },
          ],
        },
        /better-auth is in production only through excluded edges/,
      ],
    ])("%s", (_label, change, entryValue, reason) => {
      const result = prove(mutant(change), entryValue);
      expect(result.kind).toBe("exposed");
      expect(result.reasons.join("\n")).toMatch(reason);
    });

    // Only a peerOptional edge from a real (non-alias) copy of `from` is ever
    // removed, so in these cases the path through vitest is still a witness.
    it.each([
      ["a required peer", meta({ optional: false }), "-dep-> node_modules/better-auth -peer-> node_modules/vitest"],
      [
        "a dependency",
        (p: Record<string, LockNode>) => {
          p["node_modules/better-auth"].dependencies = { vitest: "^5.0.0" };
        },
        "-dep-> node_modules/better-auth -dep-> node_modules/vitest",
      ],
      [
        "an alias",
        (p: Record<string, LockNode>) => {
          p["node_modules/better-auth"].name = "evil";
        },
        "-dep-> node_modules/better-auth -peerOptional-> node_modules/vitest",
      ],
    ])("does not remove the vitest edge when better-auth has it as %s", (_label, change, witness) => {
      const result = prove(mutant(change));
      expect(result.kind).toBe("exposed");
      expect(result.witnesses.length).toBeGreaterThan(0);
      expect(result.witnesses.every((w: string) => w.includes(witness))).toBe(true);
    });
  });

  describe("unprovable (exit 2): the report does not bind to the lockfile", () => {
    const withPico = (change: (v: Vuln) => Vuln) => realProdVulns().map((v) => (v.name === "picomatch" ? change(v) : v));
    it.each([
      [
        "a reported node the lockfile lacks",
        fixtureLock(),
        withPico((v) => ({ ...v, nodes: [...PICO_NESTED, "node_modules/ghost/node_modules/picomatch"] })),
        /lists node_modules\/ghost\/node_modules\/picomatch, which package-lock.json does not have/,
      ],
      [
        "a reported node that is not picomatch",
        fixtureLock(),
        withPico((v) => ({ ...v, nodes: [...PICO_NESTED, "node_modules/react"] })),
        /lists node_modules\/react, which/,
      ],
      [
        "a reported node the lockfile marks dev",
        fixtureLock(),
        withPico((v) => ({ ...v, nodes: [...PICO_NESTED, "node_modules/picomatch"] })),
        /lists node_modules\/picomatch, which/,
      ],
      [
        "the GHSA id under another package",
        fixtureLock(),
        [...realProdVulns(), vulnAt("pico", [advisory("pico", PICOMATCH)], ["node_modules/pico"])],
        /appears under another package \("pico"\)/,
      ],
      ["an empty node list", fixtureLock(), withPico((v) => ({ ...v, nodes: [] })), /has no node list for picomatch/],
      [
        "a bundled picomatch node",
        mutant((p) => {
          p["node_modules/vitest/node_modules/picomatch"].inBundle = true;
        }),
        realProdVulns(),
        /node_modules\/vitest\/node_modules\/picomatch is a bundled dependency/,
      ],
    ])("%s", (_label, lock, vulns, problem) => {
      const result = prove(lock, PICO_ENTRY, vulns);
      expect(result.kind).toBe("unprovable");
      expect(result.problems.join("\n")).toMatch(problem);
    });

    it("an exposed result still reports report problems, and exposed decides", () => {
      const lock = mutant((p) => {
        p[""].dependencies.tinyglobby = "^0.2.17";
      });
      const vulns = realProdVulns().map((v) => (v.name === "picomatch" ? { ...v, nodes: [] } : v));
      const result = prove(lock, PICO_ENTRY, vulns);
      expect(result.kind).toBe("exposed");
      expect(result.problems).toEqual(["npm audit --omit=dev has no node list for picomatch"]);
    });
  });
});

describe("assertProjectFiles / checkProductionModel (exit 2)", () => {
  it.each([
    ["lockfileVersion 1", mutant((_p, l) => (l.lockfileVersion = 1)), /lockfileVersion must be 3/],
    ["lockfileVersion 2", mutant((_p, l) => (l.lockfileVersion = 2)), /lockfileVersion must be 3/],
    ['lockfileVersion "3"', mutant((_p, l) => (l.lockfileVersion = "3")), /lockfileVersion must be 3/],
    ["no lockfileVersion", mutant((_p, l) => delete l.lockfileVersion), /lockfileVersion must be 3, got null/],
    ["a legacy dependencies section", mutant((_p, l) => (l.dependencies = {})), /legacy top-level "dependencies"/],
    ['no packages[""]', mutant((p) => delete p[""]), /no root package/],
    ["a link", mutant((p) => (p["node_modules/next"].link = true)), /is a link/],
    ["a non-node_modules key", mutant((p) => (p["packages/app"] = { version: "1.0.0" })), /is not a node_modules path/],
    ["root workspaces", mutant((p) => (p[""].workspaces = ["packages/*"])), /workspaces are not supported/],
    ["a malformed dependency map", mutant((p) => (p["node_modules/next"].dependencies = { x: 1 })), /malformed "dependencies"/],
    ["a malformed peer meta", mutant((p) => (p["node_modules/next"].peerDependenciesMeta = { x: true })), /malformed "peerDependenciesMeta"/],
  ])("refuses %s", (_label, lock, message) => {
    expect(() => assertProjectFiles(lock, packageJsonFor(fixtureLock()))).toThrow(message);
  });

  it("refuses a lockfile out of sync with package.json", () => {
    const pj = packageJsonFor(fixtureLock()) as Record<string, Record<string, string>>;
    pj.devDependencies = { ...pj.devDependencies, typescript: "^6.0.0" };
    expect(() => assertProjectFiles(fixtureLock(), pj)).toThrow(/out of sync with package.json \("devDependencies" differs\)/);
    // Key order alone is not a difference.
    const reordered = packageJsonFor(fixtureLock()) as Record<string, Record<string, string>>;
    reordered.dependencies = { next: "16.4.5", "better-auth": ">=1.7.18 <1.8.0" };
    expect(() => assertProjectFiles(fixtureLock(), reordered)).not.toThrow();
  });

  it.each([
    [
      "a required dependency that does not resolve",
      mutant((p) => (p["node_modules/next"].dependencies = { ghost: "1.0.0" })),
      /node_modules\/next requires ghost, which does not resolve/,
    ],
    [
      "a reachable node flipped to dev",
      mutant((p) => (p["node_modules/vite"].dev = true)),
      /disagrees with npm's dev flags \(model-only: node_modules\/vite; npm-only: none\)/,
    ],
    [
      "a reported picomatch node marked dev",
      mutant((p) => (p["node_modules/vite/node_modules/picomatch"].dev = true)),
      /model-only: node_modules\/vite\/node_modules\/picomatch/,
    ],
    [
      "a non-dev orphan",
      mutant((p) => (p["node_modules/orphan"] = { version: "1.0.0" })),
      /npm-only: node_modules\/orphan/,
    ],
  ])("the model check refuses %s", (_label, lock, message) => {
    const packages = assertProjectFiles(lock, packageJsonFor(lock));
    expect(() => checkProductionModel(packages)).toThrow(message);
  });
});

describe(`runGate with ${OPTIONAL_PEER_FIELD}`, () => {
  it("passes end to end on the real reports after the typescript-eslint bump (exit 0)", async () => {
    const files = projectReader();
    const { exit, lines, args } = await fieldGate(realFullVulns(), realProdVulns(), [PICO_ENTRY], files.read);
    expect(exit).toBe(EXIT_PASS);
    expect(args).toEqual([[...NPM_AUDIT_ARGS], [...NPM_AUDIT_PROD_ARGS]]);
    expect(files.reads).toEqual(["package-lock.json", "package.json"]);
    const notice = lines.find((l) => l.startsWith("::notice::npm audit --omit=dev:"));
    expect(notice).toContain(
      `allow-listed ${PICOMATCH} (picomatch) is in the production tree only through the optional peer edge(s) better-auth > vitest (${OPTIONAL_PEER_FIELD}, proven from package-lock.json)`,
    );
    expect(notice).toContain(`Reported nodes: ${PICO_NESTED.join(", ")}.`);
    expect(notice).toContain("Path: root -dep-> node_modules/better-auth -peerOptional-> node_modules/vitest");
    expect(notice).toContain(`Reason: ${PICO_ENTRY.reason}`);
    expect(lines.at(-1)).toBe(
      "npm audit gate: no allow-listed advisory reaches a production dependency (npm audit --omit=dev) except 1 advisory(ies) proven to come only through declared optional peer edges.",
    );
  });

  it("still FAILS before the bump: typescript-estree's minimatch co-root is a mixed root (exit 1)", async () => {
    const preBump = realFullVulns().map((v) =>
      v.name === "@typescript-eslint/typescript-estree" ? vuln(v.name as string, "high", ["minimatch", "tinyglobby"]) : v,
    );
    preBump.push(vuln("minimatch", "moderate", [advisory("minimatch", MINIMATCH, "moderate")]));
    const files = projectReader();
    const { exit, lines, args } = await fieldGate(preBump, realProdVulns(), [PICO_ENTRY], files.read);
    expect(exit).toBe(EXIT_VIOLATION);
    expect(args).toHaveLength(1);
    expect(files.reads).toEqual([]);
    expect(lines.some((l) => l.startsWith("::error::npm audit: @typescript-eslint/typescript-estree (high)") && l.includes(MINIMATCH))).toBe(true);
  });

  it("FAILS with the old error when the same entry has no field (exit 1, today's text)", async () => {
    const { [OPTIONAL_PEER_FIELD]: _field, ...plain } = PICO_ENTRY;
    const files = projectReader();
    const { exit, lines } = await fieldGate(realFullVulns(), realProdVulns(), [plain], files.read);
    expect(exit).toBe(EXIT_VIOLATION);
    expect(files.reads).toEqual([]);
    expect(lines.at(-1)).toBe(formatProductionCheck([plain])[0]);
    expect(lines.at(-1)).toMatch(/^::error::npm audit: allow-listed GHSA-fc5q-39xc-vjpf \(picomatch\) now reaches a production dependency \(npm audit --omit=dev lists it\); the dev-only exception no longer holds\./);
  });

  it("FAILS with witnesses when a mutant lockfile exposes picomatch (exit 1)", async () => {
    const lock = mutant((p) => {
      p[""].dependencies.micromatch = "^4.0.8";
      delete p[""].devDependencies.micromatch;
      delete p["node_modules/micromatch"].dev;
      delete p["node_modules/picomatch"].dev;
    });
    const { exit, lines } = await fieldGate(realFullVulns(), realProdVulns(), [PICO_ENTRY], projectReader(lock).read);
    expect(exit).toBe(EXIT_VIOLATION);
    const error = lines.find((l) => l.startsWith("::error::"));
    expect(error).toContain(
      `allow-listed ${PICOMATCH} (picomatch) reaches a production dependency outside its declared optional peer edge(s) better-auth > vitest:`,
    );
    expect(error).toContain("Witness: root -dep-> node_modules/micromatch -dep-> node_modules/picomatch");
    expect(error).toContain("The dev-only exception no longer holds.");
  });

  it.each([
    ["no reader at all", undefined, /no project-file reader/],
    [
      "a reader that throws",
      () => {
        throw new Error("EACCES");
      },
      /EACCES/,
    ],
    ["a lockfile that is not JSON", projectReader("{not json").read, /JSON/],
    ["a package.json that is not JSON", projectReader(fixtureLock(), "nope").read, /JSON/],
    ["a v2 lockfile", projectReader(mutant((_p, l) => (l.lockfileVersion = 2))).read, /lockfileVersion must be 3/],
    [
      "a package.json out of sync",
      projectReader(fixtureLock(), { ...packageJsonFor(fixtureLock()), devDependencies: {} }).read,
      /out of sync/,
    ],
    ["a model disagreement", projectReader(mutant((p) => (p["node_modules/vite"].dev = true))).read, /disagrees with npm's dev flags/],
  ])("could not verify (exit 2): %s", async (_label, reader, message) => {
    const { exit, lines } = await fieldGate(realFullVulns(), realProdVulns(), [PICO_ENTRY], reader as never);
    expect(exit).toBe(EXIT_UNVERIFIED);
    expect(lines.at(-1)).toMatch(new RegExp(`^::error::npm audit --omit=dev: could not check ${OPTIONAL_PEER_FIELD} for ${PICOMATCH} \\(picomatch\\): `));
    expect(lines.at(-1)).toMatch(message);
    expect(lines.at(-1)).toMatch(/ — could not verify advisories\.$/);
  });

  it("could not verify (exit 2): an unprovable proof", async () => {
    const vulns = realProdVulns().map((v) => (v.name === "picomatch" ? { ...v, nodes: [...PICO_NESTED, "node_modules/ghost/node_modules/picomatch"] } : v));
    const { exit, lines } = await fieldGate(realFullVulns(), vulns, [PICO_ENTRY], projectReader().read);
    expect(exit).toBe(EXIT_UNVERIFIED);
    expect(lines.at(-1)).toMatch(
      /^::error::npm audit --omit=dev: could not prove allow-listed GHSA-fc5q-39xc-vjpf \(picomatch\) is limited to its declared optional peer edge\(s\) better-auth > vitest: .*ghost.* — could not verify advisories\.$/,
    );
  });

  it.each([
    ["under another package", (a: Record<string, unknown>) => ({ ...a, name: "picomatch-other" }), /"picomatch-other"/],
    ["with no package name", (a: Record<string, unknown>) => ({ ...a, name: undefined }), /\(null\)/],
  ])("could not verify (exit 2): the production audit files the id %s", async (_label, change, shown) => {
    const vulns = realProdVulns().map((v) => (v.name === "picomatch" ? { ...v, via: [change(PICO_ADVISORY)] } : v));
    const files = projectReader();
    const { exit, lines } = await fieldGate(realFullVulns(), vulns, [PICO_ENTRY], files.read);
    expect(exit).toBe(EXIT_UNVERIFIED);
    expect(files.reads).toEqual(["package-lock.json", "package.json"]);
    expect(lines.some((l) => l.includes("no longer appears in npm audit --omit=dev"))).toBe(false);
    expect(lines.at(-1)).toMatch(/^::error::npm audit --omit=dev: could not prove allow-listed GHSA-fc5q-39xc-vjpf \(picomatch\)/);
    expect(lines.at(-1)).toMatch(/appears under another package/);
    expect(lines.at(-1)).toMatch(shown);
  });

  it("reads each project file exactly once for two fielded entries", async () => {
    const SECOND = "GHSA-aaaa-bbbb-cccc";
    const second = { ...PICO_ENTRY, id: SECOND };
    const both = (vulns: Vuln[]) =>
      vulns.map((v) => (v.name === "picomatch" ? { ...v, via: [PICO_ADVISORY, advisory("picomatch", SECOND)] } : v));
    const files = projectReader();
    const { exit, lines } = await fieldGate(both(realFullVulns()), both(realProdVulns()), [PICO_ENTRY, second], files.read);
    expect(exit).toBe(EXIT_PASS);
    expect(files.reads).toEqual(["package-lock.json", "package.json"]);
    expect(lines.filter((l) => l.startsWith("::notice::npm audit --omit=dev:"))).toHaveLength(2);
    expect(lines.at(-1)).toContain("except 2 advisory(ies) proven");
  });

  it("a plain entry exposed beside a proven fielded one still FAILS (exit 1), and the proof cannot excuse it", async () => {
    // Entry B has no field; its advisory sits under vitest, inside the subtree A's edge excuses.
    const xVuln = vulnAt("x", [advisory("x", SHARP)], ["node_modules/vitest/node_modules/x"]);
    const b = entry(SHARP, "x", "2026-12-01");
    const files = projectReader();
    const { exit, lines } = await fieldGate([...realFullVulns(), xVuln], [...realProdVulns(), xVuln], [PICO_ENTRY, b], files.read);
    expect(exit).toBe(EXIT_VIOLATION);
    expect(lines.some((l) => l.startsWith("::notice::npm audit --omit=dev: allow-listed GHSA-fc5q-39xc-vjpf"))).toBe(true);
    expect(lines).toContain(formatProductionCheck([b])[0]);
  });

  it("a plain entry exposed beside an unprovable fielded one is exit 1, and both are printed", async () => {
    const xVuln = vulnAt("x", [advisory("x", SHARP)], ["node_modules/x"]);
    const b = entry(SHARP, "x", "2026-12-01");
    const prod = [...realProdVulns().map((v) => (v.name === "picomatch" ? { ...v, nodes: [] } : v)), xVuln];
    const unprovable = await fieldGate([...realFullVulns(), xVuln], prod, [PICO_ENTRY, b], projectReader().read);
    expect(unprovable.exit).toBe(EXIT_VIOLATION);
    expect(unprovable.lines).toContain(formatProductionCheck([b])[0]);
    expect(unprovable.lines.some((l) => l.startsWith("::error::npm audit --omit=dev: could not prove"))).toBe(true);

    const unreadable = await fieldGate([...realFullVulns(), xVuln], [...realProdVulns(), xVuln], [PICO_ENTRY, b]);
    expect(unreadable.exit).toBe(EXIT_VIOLATION);
    expect(unreadable.lines).toContain(formatProductionCheck([b])[0]);
    expect(unreadable.lines.at(-1)).toMatch(/no project-file reader — could not verify advisories\.$/);
  });

  it("warns, and passes, when a fielded entry no longer appears in the production audit", async () => {
    const files = projectReader();
    const full = [...bracesChain(), vuln("picomatch", "high", [PICO_ADVISORY])];
    const { exit, lines } = await fieldGate(full, [], [entry(BRACES, "braces", "2026-12-01"), PICO_ENTRY], files.read);
    expect(exit).toBe(EXIT_PASS);
    expect(files.reads).toEqual([]);
    expect(lines).toContain(
      annotation(
        "warning",
        `npm audit allow-list: ${PICOMATCH} (picomatch) no longer appears in npm audit --omit=dev; remove ${OPTIONAL_PEER_FIELD} from scripts/audit-allowlist.json.`,
      ),
    );
    expect(lines.at(-1)).toBe("npm audit gate: no allow-listed advisory reaches a production dependency (npm audit --omit=dev).");
  });
});

describe("this repository's package-lock.json", () => {
  // Invariants, not counts: the same test runs in mp-charts, event-manager,
  // mp-senior-care and music-tools. A lockfile change that breaks the proof
  // fails `npm run test:run` here, before CI's networked audit.
  const root = resolve(__dirname, "..");
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const pj = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const allowlist = JSON.parse(readFileSync(resolve(__dirname, "audit-allowlist.json"), "utf8"));

  it("is a v3 lockfile in sync with package.json, and the reach model matches npm's dev flags", () => {
    const packages = assertProjectFiles(lock, pj);
    expect(() => checkProductionModel(packages)).not.toThrow();
  });

  const fieldedEntries = (allowlist as Array<typeof PICO_ENTRY>)
    .filter((e) => Object.hasOwn(e, OPTIONAL_PEER_FIELD))
    .map((e) => [e.id, e] as [string, typeof PICO_ENTRY]);

  it.each(fieldedEntries)(
    "%s is in production only through its declared optional-peer edges",
    (_id, e) => {
      const packages = assertProjectFiles(lock, pj);
      const production = checkProductionModel(packages);
      const nodes = packageNodes(packages, e.package).filter((n: string) => production.reached.has(n));
      // Deliberately stricter than the gate, which only warns (and passes) once the
      // advisory leaves `npm audit --omit=dev`: an unused field is removed in the
      // same PR that makes it unused (e.g. a better-auth release dropping its
      // vitest peer), so the exception cannot outlive the reason for it.
      if (nodes.length === 0) {
        expect.fail(
          `${e.id}: no ${e.package} node is in the production tree any more; remove ${OPTIONAL_PEER_FIELD} from this entry in scripts/audit-allowlist.json`,
        );
      }
      const offline = report([vulnAt(e.package, [advisory(e.package, e.id)], nodes)]);
      const result = proveOptionalPeerOnly(e, offline, packages, production) as unknown as Proof;
      expect(result).toMatchObject({ kind: "proven" });
      const via = e[OPTIONAL_PEER_FIELD].map(({ from, peer }) => `node_modules/${from} -peerOptional-> node_modules/${peer}`);
      for (const path of result.paths) {
        expect(via.some((edge) => path.includes(edge))).toBe(true);
      }
    },
  );
});

describe("npm audit invocation", () => {
  it("asks for JSON and pins online, full-tree auditing over any .npmrc", () => {
    // offline=true in an .npmrc made `npm audit` print a clean report and exit 0.
    expect(NPM_AUDIT_ARGS).toEqual([
      "audit",
      "--json",
      "--offline=false",
      "--include=dev",
      "--include=optional",
      "--include=peer",
    ]);
    // The production-tree check: dev omitted on purpose, everything else pinned.
    expect(NPM_AUDIT_PROD_ARGS).toEqual([
      "audit",
      "--json",
      "--offline=false",
      "--omit=dev",
      "--include=optional",
      "--include=peer",
    ]);
    // The runner passes runGate's args straight to npm, from the repo root.
    const runner = readFileSync(resolve(__dirname, "audit-gate.mjs"), "utf8");
    expect(runner).toContain('spawnSync("npm", [...args], {');
    expect(runner).toContain("cwd: repoRoot,");
  });

  it("serves the optional-peer proof only package-lock.json and package.json", () => {
    const runner = readFileSync(resolve(__dirname, "audit-gate.mjs"), "utf8");
    expect(runner).toContain("readProjectFile: (name) => {");
    expect(runner).toContain(
      'if (name !== "package-lock.json" && name !== "package.json") throw new Error(`refusing to read ${name}`);',
    );
    expect(runner).toContain("new URL(`../${name}`, import.meta.url)");
  });
});

describe("CI wiring", () => {
  // The same test file runs in mp-charts, event-manager and mp-senior-care, so
  // it finds the workflows instead of naming them (event-manager has no
  // nightly audit). docker-build-push.yml is the deploy gate in all three.
  const WORKFLOWS = resolve(__dirname, "..", ".github/workflows");
  const read = (workflow: string) => readFileSync(resolve(WORKFLOWS, workflow), "utf8");
  const workflows = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)).sort();
  const AUDIT_STEP = /^\s*- name: Audit npm dependencies\s*$/m;
  const withAuditStep = workflows.filter((wf) => AUDIT_STEP.test(read(wf)));
  /** YAML without comment lines: comments may name the old command. */
  const code = (text: string) =>
    text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");

  /** One step of a workflow, found by its exact `- name:`. */
  function step(workflow: string, name: string): string {
    const steps = read(workflow).split(/\n(?=\s*- name: )/);
    const matches = steps.filter((s) => s.trimStart().startsWith(`- name: ${name}\n`));
    expect(matches).toHaveLength(1);
    return matches[0];
  }

  it("the deploy workflow has the 'Audit npm dependencies' step", () => {
    expect(withAuditStep).toContain("docker-build-push.yml");
  });

  it.each(withAuditStep)("%s runs the gate in 'Audit npm dependencies', with no way to fail open", (workflow) => {
    const audit = code(step(workflow, "Audit npm dependencies"));
    expect(audit).toMatch(/^\s+run: node scripts\/audit-gate\.mjs$/m);
    expect(audit).not.toMatch(/continue-on-error|\|\| true|npm audit/);
  });

  it.each(workflows)("%s never calls the raw npm audit it replaced", (workflow) => {
    const yaml = code(read(workflow));
    expect(yaml).not.toMatch(/^\s+run: npm audit\b/m);
    expect(yaml).not.toMatch(/npm audit --audit-level/);
  });
});
