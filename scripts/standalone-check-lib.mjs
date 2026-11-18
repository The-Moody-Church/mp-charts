// @ts-check
/**
 * Decision logic for the post-build standalone check
 * (`scripts/check-standalone.mjs`, run after `npm run build` in CI's `verify`
 * job and in the Dockerfile's builder stage).
 *
 * WHY THIS EXISTS
 *
 * The npm audit gate's `production_via_optional_peer` exception proves from
 * package-lock.json that an allow-listed package (picomatch) reaches the
 * production DEPENDENCY GRAPH only through an optional peer (better-auth >
 * vitest). The graph is not the image. Next decides what ships: its file
 * trace copies packages into .next/standalone/node_modules, and Turbopack
 * bundles others into .next/server chunks. An app import that the source
 * guard (src/test-only-imports.test.ts) does not recognise, or an
 * `outputFileTracingIncludes` glob, puts picomatch in the image while the gate
 * still passes. This check reads the build output itself, so it is the one
 * that decides.
 *
 * THE RULE (fail closed)
 *
 * Every npm file the server build ships must belong to a lockfile node in the
 * SHIPPED graph: reachable from the root over production edges with every
 * optional-peer edge removed (`reachProduction(packages, peerOptional)`).
 * Three sources are read, and each is mapped to its lockfile node:
 * - every file copied into `.next/standalone/node_modules`;
 * - every file listed in a `.next/**\/*.nft.json` trace (outside standalone/
 *   and cache/) that lies in the project's node_modules;
 * - every source of the source map of every `.js` file under
 *   `.next/standalone/.next/server` (the maps stay in `.next/server`). Those
 *   name the modules Turbopack bundled into the chunk.
 * A code file of a node outside the shipped graph, or a copied or traced
 * file that maps to no lockfile node, is a violation (exit 1). Only that
 * node's package.json shipping is metadata, not code (Next's trace records
 * one while resolving a package): a notice. A bundled source that maps to no
 * lockfile node was named by a package's own source map; it is a violation
 * when it names a package that has a node outside the shipped graph, else a
 * notice. A server `.js` file without a source map (other than a generated
 * data manifest, `isDataManifest`), a source map that cannot be read, a map
 * source in an unknown scheme or outside the project, or a missing
 * standalone directory is "could not verify" (exit 2), never a pass.
 *
 * Next's own vendored copies (next/dist/compiled/picomatch, ...) belong to
 * the `next` node, which ships; they are invisible to npm audit and to this
 * check alike. Client chunks (.next/static) run in the visitor's browser,
 * have no source maps in a production build, and are not checked.
 *
 * Everything here is pure; check-standalone.mjs supplies the file system.
 */

import { annotation, reachProduction } from "./audit-gate-lib.mjs";

export const EXIT_PASS = 0;
export const EXIT_VIOLATION = 1;
export const EXIT_UNVERIFIED = 2;

const NODE_MODULES = "node_modules";

/**
 * True for the generated server files that carry data, not modules, and so
 * have no source map: `*manifest.js` outside chunks/ (build, font, RSC and
 * client-reference manifests), which only assign a global and load nothing.
 * @param {string} path posix path inside the build (".next/server/...")
 * @param {string} content
 */
export function isDataManifest(path, content) {
  return (
    !path.includes("/chunks/") &&
    /(^|[/_-])[a-z-]*manifest\.js$/.test(path) &&
    /^(globalThis|self)\.__[A-Z_]+\s*=/.test(content) &&
    !/\brequire\s*\(|\bimport\s*\(/.test(content)
  );
}

/**
 * The shipped graph: production reach with every optional-peer edge removed.
 * @param {Record<string, any>} packages from `assertProjectFiles`
 * @returns {Set<string>}
 */
export function shippedNodes(packages) {
  return reachProduction(packages, (_loc, _name, type) => type === "peerOptional").reached;
}

/**
 * The lockfile node a project-relative path under node_modules belongs to:
 * the deepest `node_modules/<name>(/node_modules/<name>)*` prefix, which must
 * itself be a lockfile key. Paths deeper inside a package (its dist/, or
 * next/dist/compiled/*) belong to that package. Null when the prefix is not a
 * lockfile node (e.g. node_modules/.bin, a package npm did not install).
 * @param {Record<string, any>} packages
 * @param {string} rel posix path relative to the project root
 * @returns {string | null}
 */
export function lockfileNodeFor(packages, rel) {
  const parts = rel.split("/");
  let key = "";
  let i = 0;
  while (parts[i] === NODE_MODULES && i + 1 < parts.length) {
    const scoped = parts[i + 1].startsWith("@");
    if (scoped && i + 2 >= parts.length) return null;
    const name = scoped ? `${parts[i + 1]}/${parts[i + 2]}` : parts[i + 1];
    key = `${key === "" ? "" : `${key}/`}${NODE_MODULES}/${name}`;
    i += scoped ? 3 : 2;
  }
  return key !== "" && Object.hasOwn(packages, key) ? key : null;
}

/**
 * Every `sources` entry of a source map, sectioned (index) maps included.
 * Throws on anything that is not a source map.
 * @param {unknown} map parsed JSON
 * @returns {string[]}
 */
export function mapSources(map) {
  if (typeof map !== "object" || map === null || Array.isArray(map)) throw new Error("not a source map object");
  const m = /** @type {Record<string, any>} */ (map);
  if (Array.isArray(m.sections)) {
    return m.sections.flatMap((/** @type {any} */ section) => {
      if (typeof section !== "object" || section === null) throw new Error("malformed source map section");
      return mapSources(section.map);
    });
  }
  if (m.sources === undefined) return [];
  if (!Array.isArray(m.sources) || !m.sources.every((/** @type {unknown} */ s) => typeof s === "string" || s === null)) {
    throw new Error("source map has malformed sources");
  }
  if (typeof m.sourceRoot === "string" && m.sourceRoot !== "") throw new Error("source map sets a sourceRoot");
  return m.sources.filter((/** @type {string | null} */ s) => s !== null);
}

/** Normalizes a posix path ("a/./b/../c" -> "a/c"); keeps leading "..". @param {string} path */
function normalize(path) {
  const out = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * Where a source-map source points, relative to the project root.
 * - `turbopack:///[project]/x` -> "x"
 * - `turbopack:///[turbopack]/...` (Turbopack's runtime) -> null (not an npm file)
 * - a relative path -> resolved against the map's directory (percent-decoded)
 * Throws on any other scheme, an absolute path, or a path outside the project.
 * @param {string} source
 * @param {string} mapDir posix directory of the map, relative to the project root
 * @returns {string | null}
 */
export function resolveMapSource(source, mapDir) {
  let rel;
  if (source.startsWith("turbopack:///[turbopack]/")) return null;
  if (source.startsWith("turbopack:///[project]/")) {
    rel = normalize(decodeURIComponent(source.slice("turbopack:///[project]/".length)));
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith("/")) {
    throw new Error(`unrecognised source ${JSON.stringify(source.slice(0, 120))}`);
  } else {
    rel = normalize(`${mapDir}/${decodeURIComponent(source)}`);
  }
  if (rel === ".." || rel.startsWith("../")) throw new Error(`source outside the project: ${JSON.stringify(source.slice(0, 120))}`);
  return rel;
}

/**
 * Resolves an nft.json trace's file list against the trace's directory.
 * @param {unknown} trace parsed JSON
 * @param {string} traceDir posix directory of the trace, relative to the project root
 * @returns {string[]} project-relative paths (may start with "..")
 */
export function traceFiles(trace, traceDir) {
  const t = /** @type {Record<string, any>} */ (trace);
  if (typeof t !== "object" || t === null || !Array.isArray(t.files) || !t.files.every((/** @type {unknown} */ f) => typeof f === "string")) {
    throw new Error("not an nft.json trace (no files array)");
  }
  return t.files.map((/** @type {string} */ f) => normalize(`${traceDir}/${f}`));
}

/**
 * @typedef {"copied" | "traced" | "bundled"} ShippedKind
 * @typedef {{ path: string, kind: ShippedKind, via: string }} ShippedFile project-relative path, how it ships, and where it was seen
 * @typedef {{ node: string | null, path: string, via: string }} StandaloneViolation
 * @typedef {{ violations: StandaloneViolation[], nodes: Set<string>, metadataOnly: Set<string>, unattributed: Set<string> }} StandaloneVerdict
 */

/**
 * Names (installed and real) of every lockfile package with a node outside
 * the shipped graph: what an unattributable bundled source may not be named.
 * @param {Record<string, any>} packages @param {Set<string>} shipped
 */
function unshippedNames(packages, shipped) {
  const names = new Set();
  for (const loc of Object.keys(packages)) {
    if (loc === "" || shipped.has(loc)) continue;
    names.add(loc.slice(loc.lastIndexOf(`${NODE_MODULES}/`) + NODE_MODULES.length + 1));
    if (typeof packages[loc].name === "string") names.add(packages[loc].name);
  }
  return names;
}

/** Every package name a path names after a node_modules segment. @param {string} path */
function namesInPath(path) {
  const parts = path.split("/");
  const names = [];
  for (let i = 0; i + 1 < parts.length; i++) {
    if (parts[i] !== NODE_MODULES) continue;
    names.push(parts[i + 1].startsWith("@") && i + 2 < parts.length ? `${parts[i + 1]}/${parts[i + 2]}` : parts[i + 1]);
  }
  return names;
}

/**
 * The verdict over every shipped npm file. Paths outside node_modules are app
 * files and are ignored here. For each file under node_modules:
 * - its lockfile node is in the shipped graph: fine;
 * - it is the package.json of a node outside it: metadata only, no code
 *   (Next's trace records one while resolving a package; a notice);
 * - any other file of a node outside it: a violation;
 * - copied or traced but no lockfile node: a violation (a file on disk npm
 *   did not install);
 * - bundled but no lockfile node: a name from a package's OWN source map
 *   (lucide-react's maps name its monorepo's ../shared/src), so it cannot be
 *   attributed. A violation if any node_modules/<name> in it names a package
 *   that has a node outside the shipped graph; else a notice.
 * One violation per (node or path, kind), with its first witness.
 * @param {Record<string, any>} packages
 * @param {Set<string>} shipped from `shippedNodes`
 * @param {ShippedFile[]} files
 * @returns {StandaloneVerdict}
 */
export function checkShippedFiles(packages, shipped, files) {
  /** @type {Map<string, StandaloneViolation>} */
  const violations = new Map();
  const nodes = new Set();
  const metadataOnly = new Set();
  const unattributed = new Set();
  const forbiddenNames = unshippedNames(packages, shipped);
  const violate = (/** @type {string | null} */ node, /** @type {ShippedFile} */ file) => {
    const key = `${node ?? file.path}\u0000${file.kind}`;
    if (!violations.has(key)) violations.set(key, { node, path: file.path, via: file.via });
  };
  for (const file of files) {
    const { path, kind } = file;
    if (!path.startsWith(`${NODE_MODULES}/`)) continue;
    const node = lockfileNodeFor(packages, path);
    if (node !== null) {
      if (shipped.has(node)) nodes.add(node);
      else if (path === `${node}/package.json`) metadataOnly.add(node);
      else violate(node, file);
    } else if (kind !== "bundled" || namesInPath(path).some((name) => forbiddenNames.has(name))) {
      violate(null, file);
    } else {
      unattributed.add(path.split("/").slice(0, 2).join("/"));
    }
  }
  for (const node of nodes) metadataOnly.delete(node);
  for (const { node } of violations.values()) if (node !== null) metadataOnly.delete(node);
  return { violations: [...violations.values()], nodes, metadataOnly, unattributed };
}

/**
 * The report lines for a verdict: notices for metadata-only nodes and
 * unattributable bundled sources, then one ::error:: per violation, or one
 * line saying how many lockfile nodes the server build ships.
 * @param {StandaloneVerdict} verdict
 * @returns {string[]}
 */
export function formatVerdict({ violations, nodes, metadataOnly, unattributed }) {
  const lines = [];
  for (const node of [...metadataOnly].sort()) {
    lines.push(annotation("notice", `${node}/package.json ships (metadata only, no code); ${node} is outside the production graph without optional peers`));
  }
  if (unattributed.size > 0) {
    lines.push(
      annotation(
        "notice",
        `bundled sources named by a package's own source map, not by a lockfile node (none names a package outside the shipped graph): ${[...unattributed].sort().join(", ")}`,
      ),
    );
  }
  if (violations.length === 0) {
    lines.push(`Standalone check: the server build ships code from ${nodes.size} lockfile node(s), all in the production graph without optional peers.`);
    return lines;
  }
  for (const { node, path, via } of violations) {
    lines.push(
      node === null
        ? annotation("error", `${path} ships in the build but belongs to no package-lock.json node (${via})`)
        : annotation("error", `${node} ships in the build but is not in the production graph without optional peers (${via}: ${path})`),
    );
  }
  return lines;
}
