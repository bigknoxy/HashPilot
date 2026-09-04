import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { parseZgMarkdown, search, matchesSource, DEFAULT_SOURCE_GLOBS, type SearchHit } from "../src/core/search";
import { grepMany } from "../src/core/grep";
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp_search__");
const FIXTURE = join(import.meta.dir, "fixtures", "zg-real-hybrid.txt");
const FAKE_ZG = join(import.meta.dir, "fixtures", "fake-zg.js");

function setup() {
  mkdirSync(TMP_DIR, { recursive: true });
  // A `.zvec-grep` marker is what the adapter uses to decide an index exists.
  mkdirSync(join(TMP_DIR, ".zvec-grep"), { recursive: true });
  writeFileSync(join(TMP_DIR, "a.ts"), "export const router = 1;\n");
}

function cleanup() {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {}
}

beforeEach(setup);
afterEach(cleanup);

describe("parseZgMarkdown (golden real fixture)", () => {
  test("parses a real zg hybrid query into ordered file+span hits", () => {
    const text = readFileSync(FIXTURE, "utf-8");
    const hits = parseZgMarkdown(text);
    expect(hits.length).toBeGreaterThan(0);
    const first: SearchHit = hits[0];
    expect(first.file).toBe("src/core/router.ts");
    expect(first.startLine).toBe(108);
    expect(first.endLine).toBe(423);
  });
});

describe("search (zg engine, fake fixture)", () => {
  test("runs zg and returns parsed hits", async () => {
    const res = await search("where the router decides which edit strategy", ["src"], {
      engine: "zg",
      zgBin: FAKE_ZG,
      root: TMP_DIR,
    });
    expect(res.engine).toBe("zg");
    if (res.engine !== "zg") return;
    expect(res.hits.length).toBe(2);
    expect(res.hits[0].file).toBe("src/core/router.ts");
    expect(res.hits[0].startLine).toBe(108);
    expect(res.hits[0].endLine).toBe(423);
    expect(res.hits[0].status).toContain("stale");
  });
});

describe("search grep parity (F5) + degrade (F2)", () => {
  test("engine=grep results are result-identical to grep-many", async () => {
    const target = join(TMP_DIR, "a.ts");
    const q = "router";
    const res = await search(q, [target], { engine: "grep", zgBin: join(TMP_DIR, "no-such-zg") });
    expect(res.engine).toBe("grep");
    if (res.engine !== "grep") return;
    const g = await grepMany(q, [target]);
    expect(res.results).toEqual(g.results);
    expect(res.pattern).toEqual(g.pattern);
    expect(res.error).toEqual(g.error);
    // An explicit grep request is intended, not a degraded zg request.
    expect(res.degraded).toBe(false);
  });

  test("auto with a missing zg binary degrades to grep without failing", async () => {
    const target = join(TMP_DIR, "a.ts");
    const res = await search("router", [target], { engine: "auto", zgBin: join(TMP_DIR, "does-not-exist") });
    expect(res.engine).toBe("grep");
    if (res.engine !== "grep") return;
    expect(res.degraded).toBe(true);
    const g = await grepMany("router", [target]);
    expect(res.results).toEqual(g.results);
  });
});

describe("search engine=off never spawns zg (F6)", () => {
  test("engine=off returns empty results and never invokes zg", async () => {
    const log = join(TMP_DIR, "zg-invocations.log");
    process.env.FAKE_ZG_LOG = log;
    const res = await search("router", [join(TMP_DIR, "a.ts")], { engine: "off", zgBin: FAKE_ZG, root: TMP_DIR });
    delete process.env.FAKE_ZG_LOG;
    expect(res.engine).toBe("grep");
    if (res.engine !== "grep") return;
    expect(res.degraded).toBe(false);
    expect(res.results).toEqual([]);
    expect(existsSync(log)).toBe(false);
  });
});

describe("search sourceGlobs drop docs ranked above source (F1)", () => {
  test("a .md top hit is filtered out under source mode; code hits survive", async () => {
    // The fake zg is steered to return README.md as the #1 hit by the word "README".
    const res = await search("README doc ranking", ["src"], { engine: "zg", zgBin: FAKE_ZG, root: TMP_DIR });
    expect(res.engine).toBe("zg");
    if (res.engine !== "zg") return;
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits.every((h) => !h.file.endsWith(".md"))).toBe(true);
    expect(res.hits.some((h) => h.file === "src/core/config.ts")).toBe(true);
  });

  test("matchesSource rejects false extension matches like foo.ats for *.ts", () => {
    expect(matchesSource("bar.ts", DEFAULT_SOURCE_GLOBS)).toBe(true);
    expect(matchesSource("foo.ats", DEFAULT_SOURCE_GLOBS)).toBe(false);
    expect(matchesSource("README.md", DEFAULT_SOURCE_GLOBS)).toBe(false);
    expect(matchesSource("src/main.go", DEFAULT_SOURCE_GLOBS)).toBe(true);
    expect(matchesSource("noext", DEFAULT_SOURCE_GLOBS)).toBe(false);
  });
});

describe("search unindexed workspace (F3/F7)", () => {
  test("missing index => actionable error and no index is built", async () => {
    const noindex = join(TMP_DIR, "noindex-root");
    mkdirSync(noindex, { recursive: true }); // deliberately NO .zvec-grep
    const log = join(TMP_DIR, "zg-unindexed.log");
    process.env.FAKE_ZG_LOG = log;
    const res = await search("router", ["src"], { engine: "zg", zgBin: FAKE_ZG, root: noindex });
    delete process.env.FAKE_ZG_LOG;
    expect(res.engine).toBe("zg");
    if (res.engine !== "zg") return;
    expect(res.noIndex).toBe(true);
    expect(res.errorCode).toBe("SEARCH_NO_INDEX");
    expect(res.error).toContain("zg index");
    expect(existsSync(join(noindex, ".zvec-grep"))).toBe(false);
    expect(existsSync(log)).toBe(false); // zg was never run
  });
});
