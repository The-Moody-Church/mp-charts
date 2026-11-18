// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { builtinModules } from "module";
import { dirname, join, relative, resolve, sep } from "path";
import ts from "typescript";
import { assertProjectFiles, packageNodes, reachProduction, resolveDep } from "../scripts/audit-gate-lib.mjs";

/**
 * The npm audit gate's production_via_optional_peer exception (unused since
 * 2026-11-18, when the picomatch advisory that needed it was withdrawn) proves
 * from package-lock.json that a package reaches the production DEPENDENCY GRAPH
 * only through an OPTIONAL peer, such as better-auth's on vitest. The graph is
 * not the image: Next's standalone trace copies
 * whatever runtime code imports, and Turbopack bundles it into server chunks.
 *
 * The check that DECIDES is scripts/check-standalone.mjs, run on the build
 * output after `npm run build` (CI `verify` and the Dockerfile): it fails if
 * any npm file the server build ships, copied, traced or bundled, belongs to
 * a lockfile node outside the production graph without optional peers. This
 * test is the early warning at `npm run test:run` time, for the ways in that
 * can be read off the source:
 *
 * Every module reference in runtime code (src/** outside tests, the root files
 * Next loads at runtime, and anything those import) must be:
 * - a Node builtin, or
 * - a package.json `dependencies` entry (or a listed transitive exception)
 *   that resolves, from the root, to a lockfile node reachable from the root
 *   over production edges WITHOUT any optional-peer edge, and is not a
 *   picomatch or micromatch copy (npm's or Next's vendored
 *   next/dist/compiled/picomatch, the same 4.x the advisory covers), nor the
 *   better-auth subpath that loads vitest, or
 * - a relative or `@/` path that resolves to a file inside src/ (or a root
 *   runtime file) that is not a test, mock or test-setup file.
 * References are import/export declarations, import(), require(),
 * require.resolve(), module.require(), import.meta.resolve() and
 * `@jsxImportSource` pragmas; each must take a literal. createRequire, and
 * `require`/`module.require` used as a value, are refused outright, since a
 * call through them cannot be read. Type-only imports are exempt (erased at
 * build). next.config.ts may set only reviewed options, since
 * outputFileTracingIncludes, serverExternalPackages, turbopack.resolveAlias or
 * webpack change what ships without an import, and its image patterns may not
 * use extglobs (Next matches them with its vendored picomatch). This cannot
 * see what a dependency loads at runtime; the build check can.
 */
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src");
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_ONLY = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_DIR = /(^|\/)__(tests|mocks)__\//;
const TEST_SETUP = "src/test-setup.ts";

/** Root-level source files Next loads at runtime (cache-handler.js via require.resolve in next.config.ts). */
const ROOT_RUNTIME = ["cache-handler.js", "next.config.ts"];
/** Root-level source files that never reach the image (build, lint and test tooling). */
const ROOT_BUILD_ONLY = ["eslint.config.mjs", "next-env.d.ts", "postcss.config.mjs", "tailwind.config.js", "vitest.config.ts"];

/** Runtime imports of packages that are not direct dependencies, and why each ships anyway. */
const TRANSITIVE_ALLOWED: Record<string, string> = {
  "@better-auth/core": "a `dependencies` entry of better-auth, versioned with it (src/lib/auth.ts reads its IP helper)",
};

/** Subpaths of a production dependency that load its optional peer (better-auth/test -> dist/test-utils -> vitest). */
const FORBIDDEN_SUBPATH = /^better-auth\/(?:test|test-utils|dist\/test-utils)(?:\/|$)/;

/** Any picomatch or micromatch copy, whichever package it comes through (next/dist/compiled/picomatch included). */
const GLOB_MATCHER = /(^|\/)(picomatch|micromatch)(\/|$)/;

/** Identifiers whose calls cannot be read as a module reference. */
const FORBIDDEN_IDENTIFIERS = new Set(["createRequire", "__non_webpack_require__", "__webpack_require__", "__turbopack_require__"]);

/** Extensions a local specifier may leave off, in the order the bundler tries them. */
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];

const pj = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(ROOT, "package-lock.json"), "utf8"));
const allowlist = JSON.parse(readFileSync(resolve(ROOT, "scripts/audit-allowlist.json"), "utf8")) as Array<{
  package: string;
  production_via_optional_peer?: Array<{ from: string; peer: string }>;
}>;
const DEPENDENCIES = new Set(Object.keys(pj.dependencies ?? {}));
const packages = assertProjectFiles(lock, pj);
/** Production reach with every optional-peer edge removed: what ships however optional peers resolve. */
const shipped = reachProduction(packages, (_loc: string, _name: string, type: string) => type === "peerOptional").reached;

type ModuleRef = { spec: string | null; line: number; refused?: string };

/** `a.b` where both are plain identifiers. */
function isMember(node: ts.Node, object: string, name: string): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === object &&
    node.name.text === name
  );
}

/** `import.meta.resolve` */
function isImportMetaResolve(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.name.text === "resolve"
  );
}

/**
 * Every runtime module reference in a file: static imports/exports, import(),
 * require(), require.resolve(), module.require(), import.meta.resolve() and
 * `@jsxImportSource` pragmas. A form whose target cannot be read (createRequire,
 * `require` passed around as a value) comes back with `refused` set.
 */
function moduleRefs(fileName: string, text: string): ModuleRef[] {
  const kind = fileName.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : fileName.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(fileName)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const refs: ModuleRef[] = [];
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const literal = (node: ts.Node | undefined) =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
  const add = (node: ts.Node, spec: string | null) => refs.push({ spec, line: lineOf(node.getStart(sf)) });
  const refuse = (node: ts.Node, refused: string) => refs.push({ spec: null, line: lineOf(node.getStart(sf)), refused });
  /** True when `node` is the callee of a call (`node(...)`). */
  const isCallee = (node: ts.Node) => ts.isCallExpression(node.parent) && node.parent.expression === node;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) add(node, literal(node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (!node.isTypeOnly) add(node, literal(node.moduleSpecifier));
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      if (!node.isTypeOnly) add(node, literal(node.moduleReference.expression));
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      const isResolve = isMember(callee, "require", "resolve");
      const isModuleRequire = isMember(callee, "module", "require");
      if (isImport || isRequire || isResolve || isModuleRequire || isImportMetaResolve(callee)) {
        add(node, literal(node.arguments[0]));
      }
    } else if (ts.isIdentifier(node)) {
      if (FORBIDDEN_IDENTIFIERS.has(node.text)) {
        refuse(node, `${node.text} hides what it loads`);
      } else if (node.text === "require") {
        // Allowed only as a callee (require(...), require.resolve(...)), in typeof, or as `require.main`.
        const p = node.parent;
        const resolveCallee = ts.isPropertyAccessExpression(p) && p.expression === node && p.name.text === "resolve" && isCallee(p);
        const requireMain = ts.isPropertyAccessExpression(p) && p.expression === node && p.name.text === "main";
        const typeofRequire = ts.isTypeOfExpression(p);
        const namePosition = (ts.isPropertyAccessExpression(p) && p.name === node) || ts.isTypeReferenceNode(p);
        if (!isCallee(node) && !resolveCallee && !requireMain && !typeofRequire && !namePosition) refuse(node, "require used as a value");
      }
    } else if (ts.isPropertyAccessExpression(node) && isMember(node, "module", "require") && !isCallee(node)) {
      refuse(node, "module.require used as a value");
    } else if (ts.isElementAccessExpression(node)) {
      const key = literal(node.argumentExpression);
      if (key !== null && (FORBIDDEN_IDENTIFIERS.has(key) || key === "require")) refuse(node, `[${JSON.stringify(key)}] hides what it loads`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // A JSX pragma is a comment, so the AST walk never sees it; the compiler
  // still imports `<pkg>/jsx-runtime` for the file. Over-inclusive on purpose.
  for (const m of text.matchAll(/@jsxImportSource\s+([^\s*]+)/g)) {
    refs.push({ spec: m[1], line: lineOf(m.index ?? 0) });
  }
  return refs.sort((a, b) => a.line - b.line);
}

/** A source file under src/ that never ships: a test, a mock, or the test setup. */
function isTestFile(abs: string): boolean {
  const rel = relative(ROOT, abs).split(sep).join("/");
  return TEST_ONLY.test(rel) || TEST_DIR.test(rel) || rel === TEST_SETUP;
}

/** The file a local specifier resolves to, the way the bundler would try it; null when none exists. */
function resolveLocal(target: string): string | null {
  const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
  if (isFile(target)) return target;
  for (const ext of RESOLVE_EXTENSIONS) if (isFile(target + ext)) return target + ext;
  // TypeScript ESM style: "./x.js" naming x.ts.
  const swapped = target.replace(/\.(m|c)?jsx?$/, "");
  if (swapped !== target) for (const ext of [".ts", ".tsx", ".mts", ".cts"]) if (isFile(swapped + ext)) return swapped + ext;
  for (const ext of RESOLVE_EXTENSIONS) if (isFile(join(target, `index${ext}`))) return join(target, `index${ext}`);
  return null;
}

/** The package a bare specifier names (scope kept). */
function packageName(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Why `spec`, imported from `file`, may not ship; null when it may. */
function importProblem(file: string, spec: string | null): string | null {
  if (spec === null) return "import()/require() with a non-literal argument";
  const relativeSpec = spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../");
  if (relativeSpec || spec.startsWith("@/")) {
    // `@/` is tsconfig's paths alias for src/ (also vitest.config.ts's alias).
    const target = relativeSpec ? resolve(dirname(file), spec) : resolve(SRC, spec.slice(2));
    const rootRuntime = ROOT_RUNTIME.some((f) => resolveLocal(target) === resolve(ROOT, f));
    if (!target.startsWith(SRC + sep) && !rootRuntime) return `local import outside src/ (${relative(ROOT, target)})`;
    const found = resolveLocal(target);
    if (found === null) return `local import that resolves to no file (${relative(ROOT, target)})`;
    if (isTestFile(found)) return `runtime code imports a test, mock or test-setup file (${relative(ROOT, found)})`;
    return null;
  }
  if (spec.startsWith("/")) return "absolute import";
  if (spec.startsWith("node:") || builtinModules.includes(packageName(spec))) return null;
  if (GLOB_MATCHER.test(spec)) return "a picomatch/micromatch copy (GHSA-fc5q-39xc-vjpf), Next's vendored one included";
  if (FORBIDDEN_SUBPATH.test(spec)) return "loads better-auth's optional peer vitest";
  const name = packageName(spec);
  if (!DEPENDENCIES.has(name) && !Object.hasOwn(TRANSITIVE_ALLOWED, name)) {
    return `${name} is not in package.json dependencies`;
  }
  const loc = resolveDep(packages, "", name);
  if (loc === null || !shipped.has(loc)) return `${name} is not reachable over production edges without optional peers`;
  return null;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    if (d.isDirectory()) return sourceFiles(path);
    return SOURCE.test(d.name) && !d.name.endsWith(".d.ts") ? [path] : [];
  });
}

function runtimeFiles(): string[] {
  const src = sourceFiles(SRC).filter((file) => !isTestFile(file));
  return [...src, ...ROOT_RUNTIME.map((f) => resolve(ROOT, f))];
}

describe("runtime imports stay inside the shipped production graph", () => {
  it("every root-level source file is classified as runtime or build-only", () => {
    const root = readdirSync(ROOT, { withFileTypes: true })
      .filter((d) => d.isFile() && SOURCE.test(d.name))
      .map((d) => d.name)
      .sort();
    expect(root).toEqual([...ROOT_RUNTIME, ...ROOT_BUILD_ONLY].sort());
  });

  it("no runtime file imports a package outside package.json dependencies or the shipped graph", () => {
    const offenders = runtimeFiles().flatMap((file) =>
      moduleRefs(file, readFileSync(file, "utf8")).flatMap(({ spec, line, refused }) => {
        const problem = refused ?? importProblem(file, spec);
        return problem === null ? [] : [`${relative(ROOT, file)}:${line}: ${spec ?? "(dynamic)"}: ${problem}`];
      }),
    );
    expect(offenders).toEqual([]);
  });

  it("each listed transitive exception is not a direct dependency (drop it once it is)", () => {
    for (const name of Object.keys(TRANSITIVE_ALLOWED)) expect(DEPENDENCIES.has(name)).toBe(false);
  });

  it("the shipped graph excludes every optional peer an allow-list entry relies on, and all of its package", () => {
    const fielded = allowlist.filter((e) => Object.hasOwn(e, "production_via_optional_peer"));
    for (const entry of fielded) {
      for (const { peer } of entry.production_via_optional_peer ?? []) {
        for (const n of packageNodes(packages, peer)) expect(shipped.has(n), n).toBe(false);
      }
      for (const n of packageNodes(packages, entry.package)) expect(shipped.has(n), n).toBe(false);
    }
  });

  it("finds every runtime import form it knows, and ignores comments, strings and type-only imports", () => {
    const sample = [
      'import { globSync } from "tinyglobby";',
      'import picomatch from "picomatch";',
      "import 'vite';",
      'export * from "@vitest/spy";',
      "const v = await import(`vitest`);",
      "const f = require('fdir/dist/index.js');",
      'const p = require.resolve("micromatch");',
      'import fg = require("fast-glob");',
      "const dyn = await import(name);",
      'import { getTestInstance } from "better-auth/test";',
      'const m = module.require("vite");',
      'const u = import.meta.resolve("vitest");',
      "/** @jsxImportSource @emotion/react */",
      '// import x from "vitest"',
      "const s = \"from 'vitest'\";",
      'import type { Mock } from "vitest";',
      'export type { Mock } from "vitest";',
      'type T = typeof import("vitest");',
      "if (typeof require === 'function' && require.main === module) {}",
    ].join("\n");
    expect(moduleRefs("sample.ts", sample).map((r) => r.refused ?? r.spec)).toEqual([
      "tinyglobby",
      "picomatch",
      "vite",
      "@vitest/spy",
      "vitest",
      "fdir/dist/index.js",
      "micromatch",
      "fast-glob",
      null,
      "better-auth/test",
      "vite",
      "vitest",
      "@emotion/react",
    ]);
  });

  it("refuses the forms whose target cannot be read", () => {
    const sample = [
      'import { createRequire } from "node:module";',
      "const load = createRequire(import.meta.url);",
      'const viaModule = module.createRequire(import.meta.url)("picomatch");',
      "const r = require;",
      "const mr = module.require;",
      'const e = globalThis["require"];',
      "const w = __non_webpack_require__;",
    ].join("\n");
    const refs = moduleRefs("sample.ts", sample);
    expect(refs.filter((r) => r.refused === undefined).map((r) => r.spec)).toEqual(["node:module"]);
    expect(refs.filter((r) => r.refused !== undefined).map((r) => [r.line, r.refused])).toEqual([
      [1, "createRequire hides what it loads"],
      [2, "createRequire hides what it loads"],
      [3, "createRequire hides what it loads"],
      [4, "require used as a value"],
      [5, "module.require used as a value"],
      [6, '["require"] hides what it loads'],
      [7, "__non_webpack_require__ hides what it loads"],
    ]);
  });

  it("refuses dev-only, optional-peer-only and glob-matcher packages, and allows what ships", () => {
    const file = resolve(SRC, "lib", "x.ts");
    const refused = ["tinyglobby", "picomatch", "vite", "vitest", "vitest/config", "@vitest/spy", "fdir", "micromatch", "fast-glob"];
    for (const spec of refused) expect(importProblem(file, spec), spec).not.toBeNull();
    for (const spec of ["better-auth/test", "better-auth/test-utils", "better-auth/dist/test-utils/index.mjs"]) {
      expect(importProblem(file, spec), spec).toMatch(/optional peer vitest/);
    }
    // Next's vendored copy is in the advisory's range, and `next` ships.
    for (const spec of ["next/dist/compiled/picomatch", "next/dist/compiled/picomatch/index.js", "next/dist/compiled/micromatch", "picomatch/posix"]) {
      expect(importProblem(file, spec), spec).toMatch(/picomatch\/micromatch copy/);
    }
    expect(importProblem(file, null)).toMatch(/non-literal/);
    const allowed = ["next/server", "react", "better-auth", "better-auth/plugins", "zod", "@better-auth/core/utils/ip", "node:crypto", "fs"];
    for (const spec of allowed) expect(importProblem(file, spec), spec).toBeNull();
  });

  it("resolves relative and @/ imports, and refuses any that leave src/ or reach a test file", () => {
    const file = resolve(SRC, "lib", "x.ts");
    expect(importProblem(file, "../../scripts/audit-gate-lib.mjs")).toMatch(/outside src/);
    // `@/` is resolved, not trusted: it can climb out of src/.
    expect(importProblem(file, "@/../node_modules/picomatch/index.js")).toMatch(/outside src/);
    expect(importProblem(file, "@/../scripts/audit-gate-lib.mjs")).toMatch(/outside src/);
    // A mock, test or the test setup is never scanned as runtime code, so runtime code may not import one.
    expect(importProblem(file, "@/components/dashboard/__tests__/venn-diagram.test")).toMatch(/test, mock or test-setup/);
    expect(importProblem(file, "./auth-helpers.test")).toMatch(/test, mock or test-setup/);
    expect(importProblem(file, "../test-setup")).toMatch(/test, mock or test-setup/);
    expect(importProblem(file, "@/test-setup")).toMatch(/test, mock or test-setup/);
    expect(importProblem(file, "./no-such-module")).toMatch(/resolves to no file/);
    expect(importProblem(file, "../../cache-handler.js")).toBeNull();
    for (const spec of ["@/lib/auth", "./auth", "./auth.js", "@/lib/auth.ts", "../app/globals.css", "@/components/dashboard"]) {
      expect(importProblem(file, spec), spec).toBeNull();
    }
  });
});

describe("next.config.ts changes nothing about what ships without an import", () => {
  /**
   * Every option next.config.ts sets, reviewed. outputFileTracingIncludes,
   * serverExternalPackages, turbopack (resolveAlias), webpack, transpilePackages
   * and images all change what ships or how; adding one fails here until it is
   * reviewed against scripts/check-standalone.mjs and listed. `images` is
   * `{ unoptimized: true }` only (N14): it adds no pattern and turns the
   * optimizer off; `logging` and `poweredByHeader` change no output.
   */
  const REVIEWED_OPTIONS = [
    "cacheComponents",
    "cacheHandlers",
    "experimental",
    "headers",
    "images",
    "logging",
    "output",
    "poweredByHeader",
  ];
  const REVIEWED_EXPERIMENTAL = ["serverActions"];
  /** An extglob in a pattern: Next matches image patterns with its vendored picomatch (GHSA-fc5q-39xc-vjpf). */
  const EXTGLOB = /[@!?*+]\(/;

  /** Every string an image pattern carries (object form, URL form, or a string). */
  function patternStrings(pattern: unknown): string[] {
    if (typeof pattern === "string") return [pattern];
    if (pattern instanceof URL) return [pattern.hostname, pattern.pathname, pattern.search];
    if (typeof pattern === "object" && pattern !== null) {
      return Object.values(pattern).filter((v): v is string => typeof v === "string");
    }
    return [];
  }

  it("sets only reviewed options", async () => {
    const config = (await import("../next.config")).default as Record<string, unknown>;
    expect(Object.keys(config).sort()).toEqual(REVIEWED_OPTIONS);
    expect(Object.keys((config.experimental ?? {}) as object).sort()).toEqual(REVIEWED_EXPERIMENTAL);
  });

  it("uses no extglob in images.remotePatterns or images.localPatterns", async () => {
    const config = (await import("../next.config")).default as { images?: { remotePatterns?: unknown[]; localPatterns?: unknown[] } };
    const patterns = [...(config.images?.remotePatterns ?? []), ...(config.images?.localPatterns ?? [])];
    const extglobs = patterns.flatMap(patternStrings).filter((value) => EXTGLOB.test(value));
    expect(extglobs).toEqual([]);
    // The detector itself.
    expect(patternStrings({ hostname: "**.example.com", pathname: "/a/+(b|c)/**" }).filter((v) => EXTGLOB.test(v))).toEqual(["/a/+(b|c)/**"]);
    expect(patternStrings(new URL("https://x.example.com/@(a|b)/**")).some((v) => EXTGLOB.test(v))).toBe(true);
    expect(patternStrings("!(x)").some((v) => EXTGLOB.test(v))).toBe(true);
  });
});
