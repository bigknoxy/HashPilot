import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import {
  resolveColor,
  resolveVerbosity,
  configureOutput,
  resetOutput,
  isQuiet,
  isVerbose,
  colorEnabled,
} from "../src/core/index";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
// Match the ESC byte explicitly: a bare bracket pattern would also match the
// literal text "[0m", so it could pass on output containing no escape at all.
const ANSI = /\u001b\[[0-9;]*m/;

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "hp-output-47-"));
  writeFileSync(join(dir, "a.ts"), 'export function greet(n: string) {\n  return "hi " + n;\n}\n');
  return dir;
}

async function run(args: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { stdout, stderr, code: await proc.exited };
}

afterEach(() => resetOutput());

describe("color resolution (#47)", () => {
  test("color requires text format, a TTY, and no NO_COLOR", () => {
    expect(resolveColor({ format: "text", isTTY: true, env: {} })).toBe(true);
  });

  test("JSON output is never colorized, even on a TTY", () => {
    expect(resolveColor({ format: "json", isTTY: true, env: {} })).toBe(false);
  });

  test("a non-TTY stdout disables color so pipes stay clean", () => {
    expect(resolveColor({ format: "text", isTTY: false, env: {} })).toBe(false);
  });

  test("NO_COLOR disables color", () => {
    expect(resolveColor({ format: "text", isTTY: true, env: { NO_COLOR: "1" } })).toBe(false);
  });

  test("an empty NO_COLOR is not set, per the spec", () => {
    expect(resolveColor({ format: "text", isTTY: true, env: { NO_COLOR: "" } })).toBe(true);
  });

  test("TERM=dumb disables color", () => {
    expect(resolveColor({ format: "text", isTTY: true, env: { TERM: "dumb" } })).toBe(false);
  });

  test("--no-color (color === false) vetoes everything else", () => {
    expect(resolveColor({ format: "text", isTTY: true, color: false, env: {} })).toBe(false);
  });
});

describe("verbosity resolution (#47)", () => {
  test("defaults to normal", () => {
    expect(resolveVerbosity({})).toBe("normal");
  });

  test("--quiet beats --verbose — the quieter ask is the safer one", () => {
    expect(resolveVerbosity({ quiet: true, verbose: true })).toBe("quiet");
  });

  test("configureOutput publishes the resolved state", () => {
    configureOutput({ verbose: true, format: "text", isTTY: true, env: {} });
    expect(isVerbose()).toBe(true);
    expect(isQuiet()).toBe(false);
    expect(colorEnabled()).toBe(true);
  });

  test("resetOutput returns to the default", () => {
    configureOutput({ quiet: true });
    resetOutput();
    expect(isQuiet()).toBe(false);
    expect(colorEnabled()).toBe(false);
  });
});

describe("CLI end to end (#47)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  test("JSON output carries no ANSI escapes under any flag combination", async () => {
    const dir = workspace();
    dirs.push(dir);
    for (const flags of [[], ["--verbose"], ["--quiet"], ["--no-color"]]) {
      const { stdout } = await run([...flags, "--format", "json", "ast", "find-symbols", "a.ts"], dir);
      expect(ANSI.test(stdout)).toBe(false);
      expect(JSON.parse(stdout).ok).toBe(true);
    }
  });

  test("--quiet suppresses the text success line but never the JSON envelope", async () => {
    const dir = workspace();
    dirs.push(dir);
    const text = await run(["--quiet", "--format", "text", "ast", "find-symbols", "a.ts"], dir);
    expect(text.stdout.trim()).toBe("");
    expect(text.code).toBe(0);

    const json = await run(["--quiet", "--format", "json", "ast", "find-symbols", "a.ts"], dir);
    expect(JSON.parse(json.stdout).ok).toBe(true);
  });

  test("--verbose diagnostics go to stderr, leaving stdout parseable", async () => {
    const dir = workspace();
    dirs.push(dir);
    const { stdout, stderr } = await run(
      [
        "--verbose", "--format", "json", "route-edit", "a.ts", "rename-symbol",
        "--old-name", "greet", "--new-name", "hello", "--dry-run",
      ],
      dir,
    );
    expect(stderr).toContain("[verbose]");
    expect(stderr).toContain("route: ast");
    expect(JSON.parse(stdout).ok).toBe(true);
  });

  test("without --verbose nothing is written to stderr", async () => {
    const dir = workspace();
    dirs.push(dir);
    const { stderr } = await run(["--format", "json", "ast", "find-symbols", "a.ts"], dir);
    expect(stderr).not.toContain("[verbose]");
  });
});

describe("text mode success marking (#132)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  // Read-only payloads carry no `success` field. `finish()` only reaches a
  // renderer when success !== false, so absent must render as a success.
  test.each([
    ["ast find-symbols", ["ast", "find-symbols", "a.ts"]],
    ["route", ["route", "a.ts", "rename-symbol"]],
    ["ast capabilities", ["ast", "capabilities"]],
  ])("%s renders as a success in text mode", async (_name, args) => {
    const dir = workspace();
    dirs.push(dir);
    const { stdout, code } = await run(["--format", "text", ...(args as string[])], dir);
    expect(code).toBe(0);
    expect(stdout).toContain("✓");
    expect(stdout).not.toContain("✗");
  });
});
