// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, relative, resolve, sep } from "path";
import ts from "typescript";

/**
 * Every export of a file-level 'use server' module is a Server Action: a POST
 * endpoint whose arguments the caller controls. An export that nothing in the
 * app imports is an endpoint nobody reviews: N11 (2026-10-10 audit, fixed in
 * batch 4) found three in src/components/contact-logs/actions.ts, one a
 * general-tier duplicate of the search-tier contact-lookup-details read and one
 * a read of any log's Notes by sequential ID. Next 16.4.5 happened to leave
 * them out of the action manifest, but one import from any client component, or
 * one prop pass from a server component, would have registered them.
 *
 * This test fails when any export of any file-level 'use server' module under
 * src/ has no importer outside tests. Importers are found by parsing every
 * non-test source file under src/: named imports (by their original name),
 * `ns.name` uses of a namespace import, and re-exports followed through
 * barrels. A type-only import does not count. A namespace import used other
 * than as `ns.name`, or a dynamic `import()` of a 'use server' module, is
 * refused, since which actions it uses cannot be read. Inside a 'use server'
 * module, a named re-export (`export { a as b } from "./x"`) is an export `b`
 * that needs its own importer, and `export *` is refused. Test files never
 * count as importers; the fixture self-checks at the bottom pin each of these
 * rules against the tree it was written to catch. Delete an unused action,
 * or import it from the code that calls it; do not add an exception here.
 * Modelled on src/test-only-imports.test.ts.
 */
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src");
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_ONLY = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_DIR = /(^|\/)__(tests|mocks)__\//;
const TEST_SETUP = "src/test-setup.ts";
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const rel = (file: string) => relative(ROOT, file).split(sep).join("/");
const isTestFile = (file: string) => {
  const r = rel(file);
  return TEST_ONLY.test(r) || TEST_DIR.test(r) || r === TEST_SETUP;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function parse(file: string): ts.SourceFile {
  const kind = file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : file.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(file)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind);
}

/** True when the file's directive prologue contains "use server" (file-level, not inline). */
function isUseServerModule(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false;
    if (stmt.expression.text === "use server") return true;
  }
  return false;
}

/** Resolve a relative or `@/` specifier to a source file under the repo, or null for a package. */
function resolveLocal(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = resolve(dirname(from), spec);
  else return null;
  const candidates = [
    base,
    ...RESOLVE_EXTENSIONS.map((ext) => base + ext),
    ...RESOLVE_EXTENSIONS.map((ext) => join(base, "index" + ext)),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

/** Value exports declared in a module (types and interfaces are erased and skipped). */
function declaredValueExports(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const stmt of sf.statements) {
    if (!hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      // `export { a }` and `export { a as b } from "./x"` alike: in a 'use
      // server' module a named re-export is an action of its own, `b`, and
      // needs its own importer. (`export *` is refused in analyse().)
      if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) if (!el.isTypeOnly) names.push(el.name.text);
      } else if (ts.isExportAssignment(stmt)) {
        names.push("default");
      }
      continue;
    }
    const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
      names.push(isDefault ? "default" : stmt.name!.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.push(d.name.text);
      }
    }
  }
  return names;
}

type ModuleInfo = {
  file: string;
  sf: ts.SourceFile;
  test: boolean;
  /** `export { a as b } from './x'`: exported name b -> [x, a] */
  reexports: Map<string, [string, string]>;
  /** `export * from './x'` */
  starReexports: string[];
};

type Analysis = {
  serverModules: ModuleInfo[];
  /** `file#name` of each 'use server' export -> the non-test files that import it */
  importers: Map<string, Set<string>>;
  refusals: string[];
  orphans: string[];
};

/**
 * The whole check, over any list of files, so the self-tests below can run it
 * on a fixture as well as on src/.
 */
function analyse(files: string[]): Analysis {
  const modules = new Map<string, ModuleInfo>();
  for (const file of files) {
    const sf = parse(file);
    const info: ModuleInfo = { file, sf, test: isTestFile(file), reexports: new Map(), starReexports: [] };
    for (const stmt of sf.statements) {
      if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier || stmt.isTypeOnly) continue;
      if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
      const target = resolveLocal(file, stmt.moduleSpecifier.text);
      if (!target) continue;
      if (!stmt.exportClause) info.starReexports.push(target);
      else if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          if (el.isTypeOnly) continue;
          info.reexports.set(el.name.text, [target, (el.propertyName ?? el.name).text]);
        }
      }
    }
    modules.set(file, info);
  }

  const serverModules = [...modules.values()].filter((m) => !m.test && isUseServerModule(m.sf));
  const serverFiles = new Set(serverModules.map((m) => m.file));

  /** Follow re-exports from (module, name) to the 'use server' module that declares it, if any. */
  function origin(file: string, name: string, seen = new Set<string>()): [string, string] | null {
    const key = `${file}#${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (serverFiles.has(file)) return [file, name];
    const info = modules.get(file);
    if (!info) return null;
    const direct = info.reexports.get(name);
    if (direct) return origin(direct[0], direct[1], seen);
    for (const target of info.starReexports) {
      const found = origin(target, name, seen);
      if (found) return found;
    }
    return null;
  }

  /** Can `file` (directly or through barrels) lead to a 'use server' module? */
  function reachesServerModule(file: string, seen = new Set<string>()): boolean {
    if (serverFiles.has(file)) return true;
    if (seen.has(file)) return false;
    seen.add(file);
    const info = modules.get(file);
    if (!info) return false;
    return [...info.reexports.values()].some(([t]) => reachesServerModule(t, seen)) || info.starReexports.some((t) => reachesServerModule(t, seen));
  }

  const importers = new Map<string, Set<string>>();
  const refusals: string[] = [];
  const markUsed = (importer: string, file: string, name: string) => {
    const found = origin(file, name);
    if (!found) return;
    const key = `${found[0]}#${found[1]}`;
    if (!importers.has(key)) importers.set(key, new Set());
    importers.get(key)!.add(importer);
  };

  for (const info of modules.values()) {
    const { sf, file } = info;
    const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    // A re-export inside a 'use server' module is itself a Server Action
    // export. A named one is checked like any other export (see
    // declaredValueExports); `export *` cannot be read, so it is refused.
    if (serverFiles.has(file)) {
      for (const stmt of sf.statements) {
        if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && !stmt.isTypeOnly && !stmt.exportClause) {
          refusals.push(`${rel(file)}:${lineOf(stmt)} uses \`export *\` in a 'use server' module; export each action by name`);
        }
      }
    }

    // Test importers never count: the N11 orphans were imported only by
    // actions.test.ts. The fixture self-test below pins this.
    if (info.test) continue;

    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
      const clause = stmt.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const target = resolveLocal(file, stmt.moduleSpecifier.text);
      if (!target || !reachesServerModule(target)) continue;

      if (clause.name) markUsed(file, target, "default");
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if (!el.isTypeOnly) markUsed(file, target, (el.propertyName ?? el.name).text);
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        const ns = bindings.name.text;
        const visit = (node: ts.Node) => {
          if (ts.isIdentifier(node) && node.text === ns && node !== bindings.name) {
            const parent = node.parent;
            if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
              markUsed(file, target, parent.name.text);
            } else {
              refusals.push(`${rel(file)}:${lineOf(node)} uses namespace import \`${ns}\` of a 'use server' module other than as \`${ns}.name\``);
            }
          }
          ts.forEachChild(node, visit);
        };
        ts.forEachChild(sf, visit);
      }
    }

    const visitCalls = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        const spec = arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) ? arg.text : null;
        const target = spec ? resolveLocal(file, spec) : null;
        if (target && reachesServerModule(target)) {
          refusals.push(`${rel(file)}:${lineOf(node)} dynamically imports a 'use server' module; use a static named import`);
        }
      }
      ts.forEachChild(node, visitCalls);
    };
    visitCalls(sf);
  }

  const orphans: string[] = [];
  for (const m of serverModules) {
    for (const name of declaredValueExports(m.sf)) {
      if (!importers.has(`${m.file}#${name}`)) orphans.push(`${rel(m.file)}: ${name}`);
    }
  }
  return { serverModules, importers, refusals, orphans };
}

const { serverModules, importers, refusals, orphans } = analyse(walk(SRC));

/** Write a throwaway tree of source files and analyse it. */
function analyseFixture(tree: Record<string, string>): Analysis {
  const dir = mkdtempSync(join(tmpdir(), "server-action-exports-"));
  try {
    for (const [name, body] of Object.entries(tree)) {
      const full = join(dir, name);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    const result = analyse(walk(dir));
    // Paths in the result are relative to the repo; keep only the fixture-local part.
    const strip = (line: string) => line.replace(/^.*server-action-exports-[^/]+\//, "");
    return { ...result, refusals: result.refusals.map(strip), orphans: result.orphans.map(strip) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("every Server Action export has a non-test importer", () => {
  it("finds the file-level 'use server' modules", () => {
    // A sanity floor: if the directive detection broke, every check below
    // would pass vacuously.
    expect(serverModules.length).toBeGreaterThanOrEqual(10);
    expect(serverModules.map((m) => rel(m.file))).toContain("src/components/contact-logs/actions.ts");
    // Not 'use server' on purpose (its helpers take raw FormData; N3 follow-up).
    expect(serverModules.map((m) => rel(m.file))).not.toContain("src/components/shared-actions/processing.ts");
  });

  it("sees a known import (self-check)", () => {
    // contact-lookup-details.tsx imports this; if the importer scan broke,
    // every export would look orphaned or every check would be skipped.
    const file = resolve(SRC, "components/contact-lookup-details/actions.ts");
    expect([...(importers.get(`${file}#getContactLogsByContactId`) ?? [])].map(rel)).toContain(
      "src/components/contact-lookup-details/contact-lookup-details.tsx",
    );
  });

  it("counts no test file as an importer (self-check)", () => {
    // The N11 orphans were imported only by actions.test.ts, so a test
    // importer must never satisfy the rule.
    expect(isTestFile(resolve(SRC, "components/contact-logs/actions.test.ts"))).toBe(true);
    const testImporters = [...importers.values()].flatMap((set) => [...set]).filter(isTestFile);
    expect(testImporters.map(rel)).toEqual([]);
  });

  it("refuses imports whose use cannot be read", () => {
    expect(refusals).toEqual([]);
  });

  it("has no orphaned exports", () => {
    expect(orphans, "delete these Server Actions, or import them where they are called").toEqual([]);
  });
});

/**
 * The scan run over throwaway fixtures, so each rule is shown to fail on the
 * tree it was written to catch, not merely to pass on today's src/.
 */
describe("server-action-exports guard on fixtures (self-check)", () => {
  const actions = `"use server";
export async function used() {}
export async function onlyTested() {}
`;

  it("reports an export imported only by a test as an orphan (the N11 shape)", () => {
    const result = analyseFixture({
      "feature/actions.ts": actions,
      "feature/page.tsx": `import { used } from "./actions";\nexport const P = () => used();\n`,
      "feature/actions.test.ts": `import { onlyTested, used } from "./actions";\nvoid onlyTested; void used;\n`,
      "feature/__tests__/more.ts": `import { onlyTested } from "../actions";\nvoid onlyTested;\n`,
    });
    expect(result.orphans).toEqual(["feature/actions.ts: onlyTested"]);
    expect(result.refusals).toEqual([]);
  });

  it("follows a barrel to the 'use server' module", () => {
    const result = analyseFixture({
      "feature/actions.ts": actions,
      "feature/index.ts": `export { used as renamed, onlyTested } from "./actions";\n`,
      "feature/page.tsx": `import { renamed, onlyTested } from "./index";\nexport const P = () => [renamed(), onlyTested()];\n`,
    });
    expect(result.orphans).toEqual([]);
  });

  it("checks a named re-export inside a 'use server' module as its own export", () => {
    const result = analyseFixture({
      "feature/actions.ts": actions,
      "feature/page.tsx": `import { used, onlyTested } from "./actions";\nexport const P = () => [used(), onlyTested()];\n`,
      "other/actions.ts": `"use server";\nexport { used as borrowed } from "../feature/actions";\nexport async function own() {}\n`,
      "other/page.tsx": `import { own } from "./actions";\nexport const P = () => own();\n`,
    });
    expect(result.orphans).toEqual(["other/actions.ts: borrowed"]);
  });

  it("refuses `export *` inside a 'use server' module", () => {
    const result = analyseFixture({
      "feature/actions.ts": actions,
      "feature/page.tsx": `import { used, onlyTested } from "./actions";\nexport const P = () => [used(), onlyTested()];\n`,
      "other/actions.ts": `"use server";\nexport * from "../feature/actions";\n`,
    });
    expect(result.refusals).toEqual([
      "other/actions.ts:2 uses \`export *\` in a 'use server' module; export each action by name",
    ]);
  });

  it("refuses a namespace import used other than as ns.name, and a dynamic import", () => {
    const result = analyseFixture({
      "feature/actions.ts": actions,
      "feature/page.tsx": `import * as a from "./actions";\nexport const P = () => [a.used(), a.onlyTested(), Object.keys(a)];\n`,
      "feature/lazy.ts": `export const L = () => import("./actions");\n`,
    });
    expect([...result.refusals].sort()).toEqual([
      "feature/lazy.ts:1 dynamically imports a 'use server' module; use a static named import",
      "feature/page.tsx:2 uses namespace import \`a\` of a 'use server' module other than as \`a.name\`",
    ]);
    expect(result.orphans).toEqual([]);
  });
});
