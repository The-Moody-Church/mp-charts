import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// #217: the base image is pinned to a Node patch release so the shipped Node
// version is recorded and Dependabot can propose each new one. The floating
// `node:24-alpine` left it to whatever Docker Hub served at build time.
const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");

const fromLines = ["Dockerfile", "Dockerfile.dev"].flatMap((file) =>
  read(file)
    .split("\n")
    .filter((line) => /^FROM\s/i.test(line))
    .map((line) => ({ file, line })),
);

describe("Node base image pin", () => {
  it("finds all four FROM lines", () => {
    expect(fromLines).toHaveLength(4);
  });

  it.each(fromLines)("$file: $line is pinned to a Node patch release", ({ line }) => {
    expect(line).toMatch(/^FROM node:\d+\.\d+\.\d+-alpine AS \w+$/);
  });

  it("uses the same tag in every stage", () => {
    const tags = new Set(fromLines.map(({ line }) => line.split(/\s+/)[1]));
    expect([...tags]).toHaveLength(1);
  });

  it("matches the major in .nvmrc", () => {
    const major = read(".nvmrc").trim();
    const tag = fromLines[0].line.split(/\s+/)[1];
    expect(tag.startsWith(`node:${major}.`)).toBe(true);
  });
});
