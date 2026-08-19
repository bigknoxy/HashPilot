import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function run(args: string[], cwd = ROOT, env: Record<string, string> = {}) {
  const res = spawnSync("bun", ["run", CLI, ...args], {
    encoding: "utf8",
    cwd,
    // Keep contract runs out of the developer's real telemetry log.
    env: { ...process.env, HASHPILOT_TELEMETRY: "0", ...env },
  });
  return { code: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

describe("documented invocation shapes", () => {
  test("grep-many takes pattern and paths positionally", () => {
    const ok = run(["grep-many", "hashpilot", "package.json"]);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).data.results.length).toBeGreaterThan(0);
  });

  test("grep-many also accepts the --pattern/--path flag form", () => {
    const ok = run(["grep-many", "--pattern", "hashpilot", "--path", "package.json"]);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).data.results.length).toBeGreaterThan(0);
  });

  test("grep-many rejects --paths, which is not the flag name", () => {
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
    expect(JSON.parse(res.stdout).data).toEqual([]);
  });
});

describe("documented output shapes", () => {
  test("read-many puts its array under data, never at the top level", () => {
    // The top level is always the envelope. A bare array here is what forced
    // consumers to branch per command (#56).
    const res = run(["read-many", "package.json"]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(Array.isArray(parsed)).toBe(false);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data[0]).toHaveProperty("hash");
    expect(parsed.data[0]).toHaveProperty("content");
  });

  test("grep-many returns an object keyed by pattern and results under data", () => {
    const parsed = JSON.parse(run(["grep-many", "hashpilot", "package.json"]).stdout);
    expect(parsed.data).toHaveProperty("pattern");
    expect(Array.isArray(parsed.data.results)).toBe(true);
  });

  test("doctor returns an object with a checks array under data", () => {
    const parsed = JSON.parse(run(["doctor", "--json"]).stdout);
    expect(Array.isArray(parsed.data.checks)).toBe(true);
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

  test("an unreadable telemetry log is 5, not a clean empty read", () => {
    // An empty array on exit 0 tells an agent (and a dashboard) that nothing has
    // gone wrong, which is the opposite of what a broken log means.
    const home = mkdtempSync(join(tmpdir(), "hashpilot-home-"));
    try {
      // A directory where the log file belongs — EISDIR on every platform, and
      // it does not depend on the test user lacking root.
      mkdirSync(join(home, ".agentic-tools", "logs", "telemetry.jsonl"), { recursive: true });
      const res = run(["telemetry", "show"], ROOT, { HOME: home });
      expect(res.code).toBe(5);
      expect(JSON.parse(res.stdout).error.code).toBe("READ_FAILED");
    } finally {
      rmSync(home, { recursive: true, force: true });
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
      expect(doc).toContain(`hashpilot ${cmd}`);
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

// ── #19 (B16) — output format resolution ───────────────────────────────

describe("--format output mode (#19 B16)", () => {
   // Piped / non-TTY process (like CI) defaults to JSON with no explicit flag
  test("piped stdout defaults to JSON", () => {
    const res = run(["doctor"], ROOT, { CI: "1" });
    expect(JSON.parse(res.stdout).command).toBe("doctor");
   });

   // CI=true forces JSON even without a TTY
  test("CI=true forces JSON", () => {
    const res = run(["--format", "json", "doctor"]);
    expect(JSON.parse(res.stdout).ok).toBe(true);
   });

   // --format text emits human-readable output (not valid JSON)
  test("--format text emits text, not JSON", () => {
    const res = run(["--format", "text", "doctor"]);
    // Should fail JSON parse (text output)
    expect(() => JSON.parse(res.stdout)).toThrow();
    // But should contain the doctor summary
    expect(res.stdout).toContain("HashPilot Doctor");
   });

   // --json deprecated alias still works but warns on stderr
  test("--json (deprecated) still emits JSON with a deprecation warning", () => {
    const res = run(["--json", "doctor"]);
    expect(res.stderr).toContain("[deprecation]");
     // JSON still on stdout
    expect(JSON.parse(res.stdout).command).toBe("doctor");
   });

   // --format text takes priority over --json deprecation
  test("--format text out-prioritises --json (explicit over deprecated)", () => {
    const res = run(["--format", "text", "--json", "doctor"]);
    // text mode wins (explicit --format takes priority in resolveFormat)
    expect(res.stdout).toContain("HashPilot Doctor");
   });
});

describe("verify-changes never reports a green it did not earn (#106)", () => {
  test("no check requested exits 4 with VERIFY_NO_CHECKS, not 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "hp-noverify-"));
    const file = join(dir, "s.ts");
    writeFileSync(file, "const x = 1;\n");
    const res = run(["verify-changes", file]);
    expect(res.code).toBe(4);
    const env = JSON.parse(res.stdout);
    expect(env.ok).toBe(false);
    expect(env.data.overall).toBe("skipped");
    expect(env.data.checksRun).toEqual([]);
    expect(env.error.code).toBe("VERIFY_NO_CHECKS");
    // The recovery has to name a flag the agent can actually pass.
    expect(env.warnings.map((w: any) => w.code)).toContain("VERIFY_NO_CHECKS");
    rmSync(dir, { recursive: true, force: true });
  });

  test("text mode says nothing was verified rather than 'all checks passed'", () => {
    const dir = mkdtempSync(join(tmpdir(), "hp-noverify-txt-"));
    const file = join(dir, "s.ts");
    writeFileSync(file, "const x = 1;\n");
    const res = run(["verify-changes", "--format", "text", file]);
    expect(res.stdout).toContain("no checks ran");
    expect(res.stdout).not.toContain("all checks passed");
    rmSync(dir, { recursive: true, force: true });
  });
});
