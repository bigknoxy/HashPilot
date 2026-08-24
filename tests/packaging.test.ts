import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * #96 — the published tarball is a contract. `npm pack` is the only thing that
 * decides what a user gets from `npx @bigknoxy/hashpilot`, and it is driven by a
 * hand-maintained `files` array, so a new directory is shipped or dropped
 * silently. These tests read the same manifest npm does.
 */
const ROOT = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("package manifest", () => {
  test("publishes under the scoped name — the bare `hashpilot` is taken on npm", () => {
    expect(pkg.name).toBe("@bigknoxy/hashpilot");
  });

  test("a scoped package needs explicit public access or the publish is rejected", () => {
    expect(pkg.publishConfig?.access).toBe("public");
  });

  test("the binary is still called hashpilot — only the package name is scoped", () => {
    expect(Object.keys(pkg.bin)).toEqual(["hashpilot"]);
    expect(pkg.bin.hashpilot).toBe("./src/cli-node.cjs");
  });

  test("semantic-release is configured to publish to npm", () => {
    const rc = JSON.parse(readFileSync(join(ROOT, ".releaserc.json"), "utf8"));
    const npmPlugin = rc.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === "@semantic-release/npm",
    ) as [string, { npmPublish: boolean }] | undefined;
    expect(npmPlugin).toBeDefined();
    expect(npmPlugin![1].npmPublish).toBe(true);
  });

  test("the release workflow passes NPM_TOKEN, without which the publish cannot run", () => {
    const wf = readFileSync(join(ROOT, ".github", "workflows", "release.yml"), "utf8");
    expect(wf).toContain("NPM_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(wf).toContain("id-token: write");
  });
});

describe("npm pack contents", () => {
  // One `npm pack --dry-run` for every assertion below; it is the slow part.
  const packed = (() => {
    const r = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`npm pack failed: ${r.stderr}`);
    return (JSON.parse(r.stdout) as { files: { path: string }[] }[])[0].files.map((f) => f.path);
  })();

  test.each(["src/", "scripts/", "templates/", "docs/"])("ships %s", (dir) => {
    expect(packed.some((f) => f.startsWith(dir))).toBe(true);
  });

  test.each(["LICENSE", "package.json", "tsconfig.json"])("ships %s", (file) => {
    expect(packed).toContain(file);
  });

  test("ships the bin shim the `bin` field points at", () => {
    expect(packed).toContain("src/cli-node.cjs");
  });

  test("ships the MCP server, which is the primary distribution surface", () => {
    expect(packed).toContain("src/mcp/server.ts");
  });

  test.each(["tests/", "bench/", "node_modules/", ".github/"])("does not ship %s", (dir) => {
    expect(packed.filter((f) => f.startsWith(dir))).toEqual([]);
  });
});
