// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { assertProjectFiles, packageNodes } from "./audit-gate-lib.mjs";
import {
  EXIT_PASS,
  EXIT_UNVERIFIED,
  EXIT_VIOLATION,
  checkShippedFiles,
  formatVerdict,
  isDataManifest,
  lockfileNodeFor,
  mapSources,
  resolveMapSource,
  shippedNodes,
  traceFiles,
} from "./standalone-check-lib.mjs";

/**
 * A miniature of this repo's shape: `auth` (better-auth) declares an optional
 * peer on `vt` (vitest), which the root also has as a devDependency; `vt`
 * depends on `pm` (picomatch). `app` is an ordinary production dependency, and
 * `old` a dev-only package that Next's trace may record the package.json of.
 */
const PJ = {
  name: "fixture",
  dependencies: { app: "^1.0.0", auth: "^1.0.0" },
  devDependencies: { vt: "^1.0.0", old: "^1.0.0" },
};
const LOCK = {
  name: "fixture",
  lockfileVersion: 3,
  requires: true,
  packages: {
    "": { name: "fixture", dependencies: PJ.dependencies, devDependencies: PJ.devDependencies },
    "node_modules/app": { version: "1.0.0" },
    "node_modules/@scope/lib": { version: "1.0.0" },
    "node_modules/auth": {
      version: "1.0.0",
      dependencies: { "@scope/lib": "^1.0.0" },
      peerDependencies: { vt: "^1.0.0" },
      peerDependenciesMeta: { vt: { optional: true } },
    },
    "node_modules/vt": { version: "1.0.0", devOptional: true, dependencies: { pm: "^1.0.0" } },
    "node_modules/pm": { version: "1.0.0", devOptional: true },
    "node_modules/old": { version: "1.0.0", dev: true },
    "node_modules/app/node_modules/pm": { version: "2.0.0", dev: true },
  },
};
const packages = assertProjectFiles(LOCK, PJ);
const shipped = shippedNodes(packages);

describe("shippedNodes", () => {
  it("is production reach with every optional-peer edge removed", () => {
    expect([...shipped].sort()).toEqual(["", "node_modules/@scope/lib", "node_modules/app", "node_modules/auth"]);
  });

  it("excludes every picomatch and vitest node of this repository's lockfile, and keeps what ships", () => {
    const root = resolve(__dirname, "..");
    const real = assertProjectFiles(
      JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8")),
      JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")),
    );
    const realShipped = shippedNodes(real);
    for (const pkg of ["picomatch", "vitest", "vite", "tinyglobby", "fdir", "micromatch"]) {
      for (const node of packageNodes(real, pkg)) expect(realShipped.has(node), node).toBe(false);
    }
    for (const node of ["node_modules/next", "node_modules/better-auth", "node_modules/react", "node_modules/sharp"]) {
      expect(realShipped.has(node), node).toBe(true);
    }
  });
});

describe("lockfileNodeFor", () => {
  it("maps a path to the deepest node_modules package prefix that is a lockfile node", () => {
    expect(lockfileNodeFor(packages, "node_modules/app/index.js")).toBe("node_modules/app");
    expect(lockfileNodeFor(packages, "node_modules/app/package.json")).toBe("node_modules/app");
    expect(lockfileNodeFor(packages, "node_modules/@scope/lib/dist/x.mjs")).toBe("node_modules/@scope/lib");
    expect(lockfileNodeFor(packages, "node_modules/app/node_modules/pm/lib/a.js")).toBe("node_modules/app/node_modules/pm");
    // A vendored copy deeper inside a package belongs to that package.
    expect(lockfileNodeFor(packages, "node_modules/app/dist/compiled/pm/index.js")).toBe("node_modules/app");
  });

  it("returns null for a path npm did not install", () => {
    expect(lockfileNodeFor(packages, "node_modules/.bin/vt")).toBeNull();
    expect(lockfileNodeFor(packages, "node_modules/nope/index.js")).toBeNull();
    expect(lockfileNodeFor(packages, "node_modules/app/node_modules/nope/x.js")).toBeNull();
    expect(lockfileNodeFor(packages, "node_modules/@scope")).toBeNull();
    expect(lockfileNodeFor(packages, "node_modules")).toBeNull();
    expect(lockfileNodeFor(packages, "src/app/page.tsx")).toBeNull();
  });
});

describe("mapSources", () => {
  it("reads flat and sectioned maps, skipping null sources", () => {
    expect(mapSources({ version: 3, sources: ["a.js", null, "b.js"] })).toEqual(["a.js", "b.js"]);
    expect(mapSources({ version: 3, mappings: "" })).toEqual([]);
    expect(
      mapSources({ version: 3, sections: [{ offset: {}, map: { sources: ["a.js"] } }, { offset: {}, map: { sources: ["b.js"] } }] }),
    ).toEqual(["a.js", "b.js"]);
  });

  it("refuses anything it cannot read exactly", () => {
    expect(() => mapSources(null)).toThrow(/not a source map/);
    expect(() => mapSources([])).toThrow(/not a source map/);
    expect(() => mapSources({ sources: "a.js" })).toThrow(/malformed sources/);
    expect(() => mapSources({ sources: [1] })).toThrow(/malformed sources/);
    expect(() => mapSources({ sources: ["a.js"], sourceRoot: "/x" })).toThrow(/sourceRoot/);
    expect(() => mapSources({ sections: [null] })).toThrow(/malformed source map section/);
    expect(() => mapSources({ sections: [{ map: 5 }] })).toThrow(/not a source map/);
  });
});

describe("resolveMapSource", () => {
  const dir = ".next/server/chunks/ssr";
  it("resolves relative, percent-encoded and Turbopack project sources against the project root", () => {
    expect(resolveMapSource("../../../../node_modules/%40scope/lib/x.js", dir)).toBe("node_modules/@scope/lib/x.js");
    expect(resolveMapSource("../../../../src/app/page.tsx", dir)).toBe("src/app/page.tsx");
    expect(resolveMapSource("turbopack:///[project]/node_modules/pm/index.js", dir)).toBe("node_modules/pm/index.js");
    expect(resolveMapSource("./a/../b.js", dir)).toBe(".next/server/chunks/ssr/b.js");
  });

  it("skips Turbopack's own runtime", () => {
    expect(resolveMapSource("turbopack:///[turbopack]/nodejs/runtime.ts", dir)).toBeNull();
  });

  it("refuses an unknown scheme, an absolute path and a path outside the project", () => {
    expect(() => resolveMapSource("webpack://pm/./index.js", dir)).toThrow(/unrecognised source/);
    expect(() => resolveMapSource("file:///etc/passwd", dir)).toThrow(/unrecognised source/);
    expect(() => resolveMapSource("/abs/node_modules/pm/index.js", dir)).toThrow(/unrecognised source/);
    expect(() => resolveMapSource("../../../../../elsewhere/x.js", dir)).toThrow(/outside the project/);
    expect(() => resolveMapSource("turbopack:///[project]/../x.js", dir)).toThrow(/outside the project/);
  });
});

describe("traceFiles", () => {
  it("resolves a trace's files against its directory", () => {
    expect(traceFiles({ version: 1, files: ["../node_modules/app/index.js", "page.js"] }, ".next")).toEqual([
      "node_modules/app/index.js",
      ".next/page.js",
    ]);
  });

  it("refuses a file that is not a trace", () => {
    expect(() => traceFiles({}, ".next")).toThrow(/not an nft.json trace/);
    expect(() => traceFiles({ files: [1] }, ".next")).toThrow(/not an nft.json trace/);
    expect(() => traceFiles(null, ".next")).toThrow(/not an nft.json trace/);
  });
});

describe("isDataManifest", () => {
  it("accepts Next's generated manifests and nothing that could load a module", () => {
    expect(isDataManifest(".next/server/app/page_client-reference-manifest.js", "globalThis.__RSC_MANIFEST = {}")).toBe(true);
    expect(isDataManifest(".next/server/server-reference-manifest.js", 'self.__RSC_SERVER_MANIFEST="{}"')).toBe(true);
    expect(isDataManifest(".next/server/middleware-build-manifest.js", "globalThis.__BUILD_MANIFEST = {}")).toBe(true);
    expect(isDataManifest(".next/server/chunks/x_manifest.js", "globalThis.__X = {}")).toBe(false);
    expect(isDataManifest(".next/server/app/page.js", "globalThis.__X = {}")).toBe(false);
    expect(isDataManifest(".next/server/a-manifest.js", 'globalThis.__X = require("pm")')).toBe(false);
    expect(isDataManifest(".next/server/a-manifest.js", 'globalThis.__X = import("pm")')).toBe(false);
    expect(isDataManifest(".next/server/a-manifest.js", "module.exports = {}")).toBe(false);
  });
});

describe("checkShippedFiles", () => {
  const copied = (path: string) => ({ path, kind: "copied" as const, via: "copied into .next/standalone" });
  const traced = (path: string) => ({ path, kind: "traced" as const, via: "traced by .next/x.nft.json" });
  const bundled = (path: string) => ({ path, kind: "bundled" as const, via: "bundled into .next/server/chunks/c.js" });

  it("passes what ships and ignores app files", () => {
    const verdict = checkShippedFiles(packages, shipped, [
      copied("node_modules/app/index.js"),
      traced("node_modules/@scope/lib/x.js"),
      bundled("node_modules/auth/dist/index.mjs"),
      bundled("src/app/page.tsx"),
      traced(".next/server/app/page.js"),
      traced("../outside/file.js"),
    ]);
    expect(verdict.violations).toEqual([]);
    expect([...verdict.nodes].sort()).toEqual(["node_modules/@scope/lib", "node_modules/app", "node_modules/auth"]);
  });

  it("fails on a copied, traced or bundled file of a node outside the shipped graph, one line per node and kind", () => {
    const verdict = checkShippedFiles(packages, shipped, [
      copied("node_modules/pm/index.js"),
      copied("node_modules/pm/lib/a.js"),
      traced("node_modules/vt/index.js"),
      bundled("node_modules/app/node_modules/pm/lib/a.js"),
      bundled("node_modules/pm/index.js"),
    ]);
    expect(verdict.violations).toEqual([
      { node: "node_modules/pm", path: "node_modules/pm/index.js", via: "copied into .next/standalone" },
      { node: "node_modules/vt", path: "node_modules/vt/index.js", via: "traced by .next/x.nft.json" },
      { node: "node_modules/app/node_modules/pm", path: "node_modules/app/node_modules/pm/lib/a.js", via: "bundled into .next/server/chunks/c.js" },
      { node: "node_modules/pm", path: "node_modules/pm/index.js", via: "bundled into .next/server/chunks/c.js" },
    ]);
  });

  it("treats a lone package.json of an unshipped node as metadata, but not once any code of it ships", () => {
    const metadata = checkShippedFiles(packages, shipped, [copied("node_modules/old/package.json"), traced("node_modules/old/package.json")]);
    expect(metadata.violations).toEqual([]);
    expect([...metadata.metadataOnly]).toEqual(["node_modules/old"]);
    const code = checkShippedFiles(packages, shipped, [copied("node_modules/pm/package.json"), copied("node_modules/pm/index.js")]);
    expect(code.violations.map((v) => v.node)).toEqual(["node_modules/pm"]);
    expect([...code.metadataOnly]).toEqual([]);
    // A nested package.json is a file of the package, not its metadata.
    expect(checkShippedFiles(packages, shipped, [copied("node_modules/pm/lib/package.json")]).violations).toHaveLength(1);
  });

  it("fails on a copied or traced file that belongs to no lockfile node", () => {
    const verdict = checkShippedFiles(packages, shipped, [copied("node_modules/.bin/vt"), traced("node_modules/nope/x.js")]);
    expect(verdict.violations.map((v) => [v.node, v.path])).toEqual([
      [null, "node_modules/.bin/vt"],
      [null, "node_modules/nope/x.js"],
    ]);
  });

  it("notes a bundled source a package's own map named, unless it names an unshipped package", () => {
    const named = checkShippedFiles(packages, shipped, [bundled("node_modules/shared/src/a.ts"), bundled("node_modules/src/api/b.ts")]);
    expect(named.violations).toEqual([]);
    expect([...named.unattributed].sort()).toEqual(["node_modules/shared", "node_modules/src"]);
    const hidden = checkShippedFiles(packages, shipped, [
      bundled("node_modules/pm2/node_modules/pm/index.js"),
      bundled("node_modules/x/node_modules/vt/index.js"),
      bundled("node_modules/old/lib/x.js"),
    ]);
    expect(hidden.violations.map((v) => v.path)).toEqual([
      "node_modules/pm2/node_modules/pm/index.js",
      "node_modules/x/node_modules/vt/index.js",
      "node_modules/old/lib/x.js",
    ]);
  });
});

describe("formatVerdict", () => {
  it("prints notices, then a pass line or one ::error:: per violation", () => {
    const pass = formatVerdict({
      violations: [],
      nodes: new Set(["node_modules/app"]),
      metadataOnly: new Set(["node_modules/old"]),
      unattributed: new Set(["node_modules/shared"]),
    });
    expect(pass).toEqual([
      "::notice::node_modules/old/package.json ships (metadata only, no code); node_modules/old is outside the production graph without optional peers",
      "::notice::bundled sources named by a package's own source map, not by a lockfile node (none names a package outside the shipped graph): node_modules/shared",
      "Standalone check: the server build ships code from 1 lockfile node(s), all in the production graph without optional peers.",
    ]);
    const fail = formatVerdict({
      violations: [
        { node: "node_modules/pm", path: "node_modules/pm/index.js", via: "copied into .next/standalone" },
        { node: null, path: "node_modules/.bin/vt", via: "traced by .next/x.nft.json" },
      ],
      nodes: new Set(),
      metadataOnly: new Set(),
      unattributed: new Set(),
    });
    expect(fail).toEqual([
      "::error::node_modules/pm ships in the build but is not in the production graph without optional peers (copied into .next/standalone: node_modules/pm/index.js)",
      "::error::node_modules/.bin/vt ships in the build but belongs to no package-lock.json node (traced by .next/x.nft.json)",
    ]);
  });
});

describe("check-standalone.mjs on a fixture build", () => {
  const SCRIPT = resolve(__dirname, "check-standalone.mjs");
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function write(root: string, path: string, content: string) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  /** A build that ships `app` (copied + traced) and bundles `auth` into one server chunk. */
  function fixture(): string {
    const root = mkdtempSync(join(tmpdir(), "standalone-check-"));
    write(root, "package.json", JSON.stringify(PJ));
    write(root, "package-lock.json", JSON.stringify(LOCK));
    write(root, ".next/standalone/server.js", "");
    write(root, ".next/standalone/node_modules/app/index.js", "");
    write(root, ".next/standalone/node_modules/old/package.json", "{}");
    write(root, ".next/next-server.js.nft.json", JSON.stringify({ version: 1, files: ["../node_modules/app/index.js", "../node_modules/old/package.json"] }));
    write(root, ".next/standalone/.next/server/chunks/c.js", "module.exports=[]");
    write(root, ".next/server/chunks/c.js.map", JSON.stringify({ version: 3, sources: ["../../../node_modules/auth/index.mjs", "../../../src/app/page.tsx"] }));
    write(root, ".next/standalone/.next/server/server-reference-manifest.js", 'self.__RSC_SERVER_MANIFEST="{}"');
    return root;
  }

  const run = (root: string) => {
    const result = spawnSync(process.execPath, [SCRIPT, root], { encoding: "utf8" });
    return { status: result.status, out: result.stdout };
  };

  it("exits 0 when everything shipped is in the shipped graph", () => {
    dir = fixture();
    const { status, out } = run(dir);
    expect(out).toContain("ships code from 2 lockfile node(s)");
    expect(out).toContain("::notice::node_modules/old/package.json ships (metadata only");
    expect(status).toBe(EXIT_PASS);
  });

  it("exits 1 when a copied file belongs to an optional-peer-only package", () => {
    dir = fixture();
    write(dir, ".next/standalone/node_modules/pm/index.js", "");
    const { status, out } = run(dir);
    expect(out).toContain("::error::node_modules/pm ships in the build but is not in the production graph without optional peers (copied into .next/standalone");
    expect(status).toBe(EXIT_VIOLATION);
  });

  it("exits 1 when a trace lists one", () => {
    dir = fixture();
    write(dir, ".next/server/app/page.js.nft.json", JSON.stringify({ version: 1, files: ["../../../node_modules/vt/index.js"] }));
    const { status, out } = run(dir);
    expect(out).toContain("::error::node_modules/vt ships in the build but is not in the production graph without optional peers (traced by .next/server/app/page.js.nft.json");
    expect(status).toBe(EXIT_VIOLATION);
  });

  it("exits 1 when a server chunk bundles one", () => {
    dir = fixture();
    write(dir, ".next/server/chunks/c.js.map", JSON.stringify({ version: 3, sources: ["../../../node_modules/pm/index.js"] }));
    const { status, out } = run(dir);
    expect(out).toContain("::error::node_modules/pm ships in the build but is not in the production graph without optional peers (bundled into .next/server/chunks/c.js");
    expect(status).toBe(EXIT_VIOLATION);
  });

  it.each([
    ["no standalone output", (root: string) => rmSync(join(root, ".next/standalone"), { recursive: true }), /\.next\/standalone does not exist/],
    ["a server chunk without a source map", (root: string) => rmSync(join(root, ".next/server/chunks/c.js.map")), /has no source map/],
    ["a source map it cannot place", (root: string) => write(root, ".next/server/chunks/c.js.map", JSON.stringify({ sources: ["webpack://pm/index.js"] })), /unrecognised source/],
    ["no trace at all", (root: string) => rmSync(join(root, ".next/next-server.js.nft.json")), /no \.nft\.json trace/],
    ["a lockfile out of sync with package.json", (root: string) => write(root, "package.json", JSON.stringify({ ...PJ, dependencies: { app: "^1.0.0" } })), /out of sync/],
  ])("exits 2 on %s", (_name, breakIt, message) => {
    dir = fixture();
    breakIt(dir);
    const { status, out } = run(dir);
    expect(out).toMatch(/^::error::Standalone check could not verify the build: /m);
    expect(out).toMatch(message);
    expect(status).toBe(EXIT_UNVERIFIED);
  });
});

describe("CI wiring", () => {
  const ROOT = resolve(__dirname, "..");
  const code = (text: string) =>
    text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");

  // Two CI layouts are in use across the four repos. Most run `npm run build` on
  // the runner in a `verify` job, and that job must check the build it made.
  // music-tools never builds outside Docker: its only build is the Dockerfile's,
  // which the next test pins. Either way every CI build is checked.
  it("every CI build outside Docker is followed by the check, with no way to fail open", () => {
    const workflow = code(readFileSync(resolve(ROOT, ".github/workflows/docker-build-push.yml"), "utf8"));
    const jobs = workflow.split(/\n {2}(?=[A-Za-z0-9_-]+:\n)/).slice(1);
    const step = "- name: Check the standalone build ships only production packages\n        run: npm run check:standalone\n";
    const building = jobs.filter((job) => job.includes("run: npm run build\n"));
    for (const job of building) {
      const build = job.indexOf("run: npm run build\n");
      expect(job.indexOf(step, build), `job ${job.split(":")[0]} builds without the check after it`).toBeGreaterThan(build);
      expect(job).not.toMatch(/continue-on-error/);
    }
    if (building.length === 0) {
      // No runner build at all: the image build (Dockerfile, next test) is the only one.
      expect(workflow).toMatch(/uses: docker\/build-push-action@/);
    }
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["check:standalone"]).toBe("node scripts/check-standalone.mjs");
  });

  it("the Dockerfile checks the build that ships, in the builder stage, before the runner copies it", () => {
    const dockerfile = code(readFileSync(resolve(ROOT, "Dockerfile"), "utf8"));
    const builder = dockerfile.indexOf("AS builder");
    const build = dockerfile.indexOf("npm run build", builder);
    const check = dockerfile.indexOf("\nRUN node scripts/check-standalone.mjs\n", build);
    const runner = dockerfile.indexOf("AS runner");
    expect(builder).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(build);
    expect(runner).toBeGreaterThan(check);
    expect(dockerfile).not.toMatch(/check-standalone\.mjs[^\n]*(\|\||;)/);
  });
});
