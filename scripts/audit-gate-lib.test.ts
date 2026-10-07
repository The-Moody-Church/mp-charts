// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  ENDPOINT_ERROR_MARKER,
  EXIT_PASS,
  EXIT_UNVERIFIED,
  EXIT_VIOLATION,
  MAX_ATTEMPTS,
  NPM_AUDIT_ARGS,
  RETRY_DELAY_MS,
  advisoryGhsaId,
  annotation,
  assertAuditReport,
  evaluateAudit,
  formatResult,
  parseAuditOutput,
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
    expect(file).toContainEqual(
      expect.objectContaining({ id: BRACES, package: "braces", added: "2026-10-07", review_by: "2026-11-07" }),
    );
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
  const goodRun = (vulns: Vuln[]) => ({ status: 1, stdout: JSON.stringify(report(vulns)), stderr: "" });
  const endpointDown = { status: 1, stdout: "{}", stderr: `npm error ${ENDPOINT_ERROR_MARKER}` };

  function harness(runs: Array<Record<string, unknown>>, allowlist: unknown = ALLOWLIST) {
    const lines: string[] = [];
    const sleeps: number[] = [];
    let calls = 0;
    const exit = runGate({
      runAudit: () => runs[Math.min(calls++, runs.length - 1)] as never,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      print: (line: string) => lines.push(line),
      allowlist,
      today: TODAY,
    });
    return { exit, lines, sleeps, calls: () => calls };
  }

  it("passes the allow-listed chain (exit 0)", async () => {
    const h = harness([goodRun(bracesChain())]);
    expect(await h.exit).toBe(EXIT_PASS);
    expect(h.lines.filter((l) => l.startsWith("::notice::"))).toHaveLength(5);
  });

  it("fails a violation (exit 1)", async () => {
    const h = harness([goodRun([vuln("sharp", "high", [advisory("sharp", SHARP)])])]);
    expect(await h.exit).toBe(EXIT_VIOLATION);
  });

  it(`retries an endpoint error, ${MAX_ATTEMPTS} attempts in all, then FAILS — never passes`, async () => {
    const h = harness([endpointDown]);
    expect(await h.exit).toBe(EXIT_UNVERIFIED);
    expect(h.calls()).toBe(MAX_ATTEMPTS);
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
    const runner = readFileSync(resolve(__dirname, "audit-gate.mjs"), "utf8");
    expect(runner).toContain('spawnSync("npm", [...NPM_AUDIT_ARGS], {');
  });
});

describe("CI wiring", () => {
  /** One step of a workflow, found by its exact `- name:`. */
  function step(workflow: string, name: string): string {
    const wf = readFileSync(resolve(__dirname, "..", ".github/workflows", workflow), "utf8");
    const steps = wf.split(/\n(?=\s*- name: )/);
    const matches = steps.filter((s) => s.trimStart().startsWith(`- name: ${name}\n`));
    expect(matches).toHaveLength(1);
    return matches[0];
  }

  it.each(["docker-build-push.yml", "audit-nightly.yml"])(
    "%s runs the gate in 'Audit npm dependencies', with no way to fail open",
    (workflow) => {
      // Comments may name the old command; the step's YAML may not.
      const audit = step(workflow, "Audit npm dependencies")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
      expect(audit).toMatch(/^\s+run: node scripts\/audit-gate\.mjs$/m);
      expect(audit).not.toMatch(/continue-on-error|\|\| true|npm audit/);
      const wf = readFileSync(resolve(__dirname, "..", ".github/workflows", workflow), "utf8");
      // The raw call it replaced must not come back in any other step.
      expect(wf).not.toMatch(/^\s+run: npm audit\b/m);
    },
  );
});
