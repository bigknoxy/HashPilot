import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * #57 — Commander's own parse failures used to escape the JSON contract: an
 * unknown flag printed `error: unknown option '--x'` on stderr and exited 1
 * with nothing on stdout, so an agent had no structured failure to recover
 * from. Every parse error now rides the usage envelope.
 */

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");

function run(args: string[]) {
  const res = spawnSync("bun", ["run", CLI, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, HASHPILOT_TELEMETRY: "0" },
  });
  return { code: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function envelope(out: string) {
  return JSON.parse(out);
}

describe("parse errors ride the JSON envelope", () => {
  test("an unknown flag is a usage envelope on stdout, not a bare line on stderr", () => {
    const r = run(["grep-many", "--bogus-flag"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe("");
    const env = envelope(r.stdout);
    expect(env.ok).toBe(false);
    expect(env.command).toBe("grep-many");
    expect(env.error.code).toBe("INVALID_ARGUMENT");
    expect(env.error.message).toContain("--bogus-flag");
    expect(env.error.recovery).toContain("--help");
  });

  test("the same holds for an unrelated subcommand — one handler, not per-command", () => {
    const r = run(["read-many", "--nope"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe("");
    expect(envelope(r.stdout).error.code).toBe("INVALID_ARGUMENT");
  });

  test("a missing required positional is a usage envelope too", () => {
    const r = run(["read-many"]);
    expect(r.code).toBe(1);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("INVALID_ARGUMENT");
    expect(env.error.message).toContain("files");
  });

  test("an unknown subcommand is a usage envelope", () => {
    const r = run(["no-such-command"]);
    expect(r.code).toBe(1);
    expect(envelope(r.stdout).error.code).toBe("INVALID_ARGUMENT");
  });

  test("--help still prints help and exits 0", () => {
    const r = run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("grep-many");
  });

  test("--version still prints the version and exits 0", () => {
    const r = run(["--version"]);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("grep-many accepts both argument forms", () => {
  test("positional and flag forms produce identical results", () => {
    const positional = run(["grep-many", "hashpilot", "package.json"]);
    const flagged = run(["grep-many", "--pattern", "hashpilot", "--path", "package.json"]);
    expect(positional.code).toBe(0);
    expect(flagged.code).toBe(0);
    const a = envelope(positional.stdout).data;
    const b = envelope(flagged.stdout).data;
    expect(b.pattern).toBe(a.pattern);
    expect(b.results).toEqual(a.results);
  });

  test("--path is repeatable", () => {
    const r = run(["grep-many", "--pattern", "hashpilot", "--path", "package.json", "--path", "README.md"]);
    expect(r.code).toBe(0);
    const files = new Set(envelope(r.stdout).data.results.map((x: any) => x.path));
    expect(files.size).toBeGreaterThan(1);
  });

  test("mixing the two forms for the pattern is a usage error", () => {
    const r = run(["grep-many", "hashpilot", "--pattern", "hashpilot", "package.json"]);
    expect(r.code).toBe(1);
    expect(envelope(r.stdout).error.code).toBe("INVALID_ARGUMENT");
  });

  test("mixing the two forms for the paths is a usage error", () => {
    const r = run(["grep-many", "--pattern", "hashpilot", "--path", "package.json", "extra.md"]);
    expect(r.code).toBe(1);
    expect(envelope(r.stdout).error.code).toBe("INVALID_ARGUMENT");
  });

  test("no pattern at all is a usage error naming the shape", () => {
    const r = run(["grep-many"]);
    expect(r.code).toBe(1);
    expect(envelope(r.stdout).error.message).toContain("pattern");
  });

  test("a pattern with no paths is a usage error", () => {
    const r = run(["grep-many", "--pattern", "hashpilot"]);
    expect(r.code).toBe(1);
    expect(envelope(r.stdout).error.message).toContain("path");
  });
});
