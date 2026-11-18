#!/usr/bin/env node
// @ts-check
/**
 * Post-build standalone check: fails when the server build ships an npm file
 * outside the production graph without optional peers (the graph the audit
 * gate's production_via_optional_peer proof is about). Run after
 * `npm run build`: CI's `verify` job, and the Dockerfile's builder stage, so
 * the image that ships is the build that was checked. The rule and its tests:
 * scripts/standalone-check-lib.mjs / scripts/standalone-check-lib.test.ts.
 *
 *   node scripts/check-standalone.mjs [projectRoot]
 *
 * projectRoot defaults to the repository this file lives in (tests pass a
 * fixture project).
 *
 * Exit 0: every shipped npm file is in the shipped graph.
 * Exit 1: at least one is not (printed as ::error::, with where it was seen).
 * Exit 2: could not verify — no .next/standalone, an unreadable or
 *         inconsistent package-lock.json, a server .js file without a source
 *         map, or a map source this check cannot place. Never a pass.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { annotation, assertProjectFiles } from "./audit-gate-lib.mjs";
import {
  EXIT_PASS,
  EXIT_UNVERIFIED,
  EXIT_VIOLATION,
  checkShippedFiles,
  formatVerdict,
  isDataManifest,
  mapSources,
  resolveMapSource,
  shippedNodes,
  traceFiles,
} from "./standalone-check-lib.mjs";

const ROOT = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL("..", import.meta.url));
const NEXT = join(ROOT, ".next");
const STANDALONE = join(NEXT, "standalone");

/** posix path relative to the project root @param {string} abs */
const rel = (abs) => relative(ROOT, abs).split(sep).join("/");

/** Every file under `dir`, recursively; `skip` prunes directories. @param {string} dir @param {(abs: string) => boolean} [skip] @returns {string[]} */
function walk(dir, skip = () => false) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const abs = join(dir, d.name);
    if (d.isDirectory()) return skip(abs) ? [] : walk(abs, skip);
    return [abs];
  });
}

/** @param {string} abs */
const readJson = (abs) => JSON.parse(readFileSync(abs, "utf8"));

function main() {
  if (!existsSync(STANDALONE)) throw new Error(".next/standalone does not exist; run `npm run build` first (output: \"standalone\")");
  const packages = assertProjectFiles(readJson(join(ROOT, "package-lock.json")), readJson(join(ROOT, "package.json")));
  const shipped = shippedNodes(packages);

  /** @type {import("./standalone-check-lib.mjs").ShippedFile[]} */
  const files = [];

  // 1. What Next copied into the standalone tree.
  const standaloneFiles = walk(STANDALONE);
  for (const abs of standaloneFiles) {
    const inStandalone = relative(STANDALONE, abs).split(sep).join("/");
    if (inStandalone.startsWith("node_modules/")) files.push({ path: inStandalone, kind: "copied", via: "copied into .next/standalone" });
  }

  // 2. What Next's file traces say ships (the standalone copies are skipped:
  //    their paths resolve inside standalone/, already walked above).
  const traces = walk(NEXT, (abs) => abs === STANDALONE || abs === join(NEXT, "cache")).filter((f) => f.endsWith(".nft.json"));
  if (traces.length === 0) throw new Error("no .nft.json trace under .next");
  for (const abs of traces) {
    const dir = rel(join(abs, ".."));
    for (const path of traceFiles(readJson(abs), dir)) files.push({ path, kind: "traced", via: `traced by ${rel(abs)}` });
  }

  // 3. What Turbopack bundled into each shipped server chunk, from its map.
  const serverJs = standaloneFiles.filter((abs) => abs.endsWith(".js") && relative(STANDALONE, abs).startsWith(`.next${sep}server${sep}`));
  if (serverJs.length === 0) throw new Error("no server .js file in .next/standalone/.next/server");
  let mapped = 0;
  for (const abs of serverJs) {
    const inBuild = relative(STANDALONE, abs); // .next/server/...
    const mapPath = join(ROOT, `${inBuild}.map`);
    if (!existsSync(mapPath)) {
      if (isDataManifest(inBuild.split(sep).join("/"), readFileSync(abs, "utf8"))) continue;
      throw new Error(`${inBuild.split(sep).join("/")} has no source map, so what it bundles cannot be checked`);
    }
    mapped++;
    const mapDir = rel(join(mapPath, ".."));
    let sources;
    try {
      sources = mapSources(readJson(mapPath));
    } catch (error) {
      throw new Error(`${rel(mapPath)}: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const source of sources) {
      let path;
      try {
        path = resolveMapSource(source, mapDir);
      } catch (error) {
        throw new Error(`${rel(mapPath)}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (path !== null) files.push({ path, kind: "bundled", via: `bundled into ${inBuild.split(sep).join("/")}` });
    }
  }

  const verdict = checkShippedFiles(packages, shipped, files);
  for (const line of formatVerdict(verdict)) console.log(line);
  console.log(`(${standaloneFiles.length} standalone files, ${traces.length} traces, ${mapped} server source maps read)`);
  return verdict.violations.length === 0 ? EXIT_PASS : EXIT_VIOLATION;
}

let code;
try {
  code = main();
} catch (error) {
  console.log(annotation("error", `Standalone check could not verify the build: ${error instanceof Error ? error.message : String(error)}`));
  code = EXIT_UNVERIFIED;
}
process.exit(code);
