import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync, existsSync, rmSync, readdirSync, statSync } from "fs";
import { join, resolve, relative } from "path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const SITE = join(REPO_ROOT, "site");
const WORKFLOW = join(REPO_ROOT, ".github", "workflows", "gh-pages.yml");

/** Files that must never reach a public branch. */
const PRIVATE_FILES = ["AUDIT-2026-08.md", "M5_PLAN.md", "M6_AUTOPLAN_REVIEW.md", "CLAUDE.md", "AGENTS.md", "package.json", "bun.lock"];
const PRIVATE_DIRS = ["src", "tests", "scripts", ".github", "node_modules", "bench", ".claude", "schema", "templates", "dist"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(relative(SITE, full));
  }
  return out;
}

describe("#49 gh-pages publishes an allowlisted site, not the repository", () => {
  let files: string[];

  beforeAll(() => {
    rmSync(SITE, { recursive: true, force: true });
    const proc = Bun.spawnSync(["bash", join(REPO_ROOT, "scripts", "build-site.sh")], { cwd: REPO_ROOT });
    expect(proc.exitCode).toBe(0);
    files = walk(SITE);
  });

  afterAll(() => {
    rmSync(SITE, { recursive: true, force: true });
  });

  it("never publishes the repository root", () => {
    const yml = readFileSync(WORKFLOW, "utf8");
    expect(yml).not.toMatch(/publish_dir:\s*\.\s*$/m);
    expect(yml).toContain("publish_dir: ./site");
  });

  it("orphans the branch so the old published history is not recoverable", () => {
    expect(readFileSync(WORKFLOW, "utf8")).toContain("force_orphan: true");
  });

  it("builds the site before publishing", () => {
    expect(readFileSync(WORKFLOW, "utf8")).toContain("bash scripts/build-site.sh");
  });

  it("contains the landing page and nothing that was internal by convention", () => {
    expect(files).toContain("index.html");
    for (const f of PRIVATE_FILES) expect(files).not.toContain(f);
    for (const d of PRIVATE_DIRS) {
      expect(files.some((f) => f.startsWith(d + "/"))).toBe(false);
    }
  });

  it("publishes only docs the landing page or install path actually needs", () => {
    const docs = files.filter((f) => f.startsWith("docs/")).sort();
    expect(docs.length).toBeGreaterThan(0);
    for (const d of docs) expect(d.endsWith(".md")).toBe(true);
  });

  it("ships every relative asset index.html links to", () => {
    const html = readFileSync(join(SITE, "index.html"), "utf8");
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((r) => !/^(https?:|data:|#|mailto:)/.test(r));
    for (const ref of refs) {
      expect(existsSync(join(SITE, ref.split("#")[0]))).toBe(true);
    }
  });

  it("disables Jekyll so underscore-prefixed paths survive", () => {
    expect(files).toContain(".nojekyll");
  });
});
