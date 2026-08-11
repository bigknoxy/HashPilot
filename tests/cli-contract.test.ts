import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, spliceGenerated, walk } from "../scripts/gen-cli-quickref";

/**
 * Executable version of docs/CLI-QUICKREF.md's "Gotchas" section. Every claim the
 * quickref makes about invocation shape, output shape, or exit code is asserted
 * here, so the doc cannot quietly become folklore.
 */

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");
const QUICKREF = join(ROOT, "docs", "CLI-QUICKREF.md");

function run(args: string[], cwd = ROOT) {
  const res = spawnSync("bun", ["run", CLI, ...args], {
    encoding: "utf8",
    cwd,
    // Keep contract runs out of the developer's real telemetry log.
    env: { ...process.env, HASHPILOT_TELEMETRY: "0" },
  });
  return { code: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

describe("documented invocation shapes", () => {
  test("grep-many takes pattern and paths positionally", () => {
    const ok = run(["grep-many", "hashpilot", "package.json"]);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).results.length).toBeGreaterThan(0);
  });

  test("grep-many rejects the --pattern/--paths flags an agent might guess", () => {
    const bad = run(["grep-many", "--pattern", "hashpilot", "--paths", "package.json"]);
    expect(bad.code).toBe(1);
  });

  test("symbol-lookup-many takes paths positionally but names via --names", () => {
    const res = run(["symbol-lookup-many", "src/core/exit-codes.ts", "--names", "exitCodeFor"]);
    expect(res.code).toBe(0);
  });

  test("the telemetry subcommand is `show`, and `recent` does not exist", () => {
    expect(run(["telemetry", "show", "-n", "1"]).code).toBe(0);
    expect(run(["telemetry", "recent"]).code).toBe(1);
  });

  test("`telemetry show -n 0` returns no events, not the whole log", () => {
    // `slice(-0)` is `slice(0)`: asking for zero used to dump everything.
    const res = run(["telemetry", "show", "-n", "0"]);
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual([]);
  });
});

describe("documented output shapes", () => {
  test("read-many returns a bare top-level array", () => {
    const res = run(["read-many", "package.json"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty("hash");
    expect(parsed[0]).toHaveProperty("content");
  });

  test("grep-many returns an object keyed by pattern and results", () => {
    const parsed = JSON.parse(run(["grep-many", "hashpilot", "package.json"]).stdout);
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed).toHaveProperty("pattern");
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  test("doctor returns an object with a checks array", () => {
    const parsed = JSON.parse(run(["doctor"]).stdout);
    expect(Array.isArray(parsed.checks)).toBe(true);
  });
});

describe("documented exit codes", () => {
  test("success is 0", () => {
    expect(run(["read-many", "package.json"]).code).toBe(0);
  });

  test("a usage error is 1", () => {
    expect(run(["telemetry", "show", "--limit", "abc"]).code).toBe(1);
    expect(run(["telemetry", "health", "--window", "abc"]).code).toBe(1);
  });

  test("a stale anchor is 3 (retryable), not 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "hashpilot-contract-"));
    try {
      const file = join(dir, "sample.ts");
      writeFileSync(file, "export const a = 1;\n");
      // A hash that matches nothing in the file: the anchor is stale, which is
      // the one failure an agent is expected to retry after a fresh read.
      const res = run(["replace-hash", file, "0".repeat(64), "export const a = 2;"], dir);
      expect(res.code).toBe(3);
      // And refusing must not have touched the file.
      expect(readFileSync(file, "utf8")).toBe("export const a = 1;\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an unknown command is 1", () => {
    expect(run(["definitely-not-a-command"]).code).toBe(1);
  });

  test("no documented command exits 70 on ordinary bad input", () => {
    // Exit 70 means "HashPilot bug, file a report". Reaching it from a plain
    // missing path is the regression this guards.
    for (const args of [
      ["read-many", "/nonexistent/definitely/missing.ts"],
      ["ast", "find-symbols", "/nonexistent/definitely/missing.ts"],
      ["read-hash", "/nonexistent/definitely/missing.ts", "1"],
    ]) {
      expect(run(args).code).not.toBe(70);
    }
  });
});

describe("docs/CLI-QUICKREF.md", () => {
  test("is in sync with the CLI's own --help output", () => {
    const current = readFileSync(QUICKREF, "utf8");
    expect(spliceGenerated(current, render(walk()))).toBe(current);
  }, 60_000);

  test("documents every top-level command", () => {
    const doc = readFileSync(QUICKREF, "utf8");
    const help = run(["--help"]).stdout;
    const commands = help
      .slice(help.indexOf("Commands:"))
      .split("\n")
      .slice(1)
      .map((l) => l.trim().split(/\s+/)[0])
      .filter((c): c is string => Boolean(c) && c !== "help");
    expect(commands.length).toBeGreaterThan(10);
    for (const cmd of commands) {
      expect(doc).toContain(`structured-edit ${cmd}`);
    }
  });

  test("documents the global flags, including the write-boundary ones", () => {
    // An agent that has to guess `--allowed-root` guesses wrong, and the flags
    // it guesses at are the ones governing where the tool may write.
    const doc = readFileSync(QUICKREF, "utf8");
    for (const flag of ["--allowed-root", "--allow-outside-root", "--no-telemetry", "--version"]) {
      expect(doc).toContain(flag);
    }
  });

  test("keeps its hand-written gotchas outside the generated block", () => {
    const doc = readFileSync(QUICKREF, "utf8");
    const prose = doc.slice(0, doc.indexOf("<!-- BEGIN GENERATED"));
    for (const claim of ["## Gotchas", "bare top-level array", "telemetry show", "exit code"]) {
      expect(prose.toLowerCase()).toContain(claim.toLowerCase());
    }
  });
});
