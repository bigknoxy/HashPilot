import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { detectInstallMode } from "../src/core/index";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const homes: string[] = [];

/**
 * `doctor` reads HOME at module load, so every case runs the real CLI in a
 * subprocess with a synthetic HOME. That is also the only way to observe the
 * exit code, which is the whole point of #46.
 */
async function doctorIn(home: string, args: string[] = []) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args, "doctor"], {
    env: { ...process.env, HOME: home },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { stdout, stderr, code: await proc.exited };
}

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), "hp-doctor-46-"));
  homes.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of homes.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("install mode detection (#46)", () => {
  test("a node_modules path is an npm package install", () => {
    expect(detectInstallMode("/usr/lib/node_modules/hashpilot/dist")).toBe("package");
  });

  test("a path under ~/.agentic-tools is an installed copy", () => {
    expect(detectInstallMode(join(process.env.HOME || "/root", ".agentic-tools", "structured-editing", "src"))).toBe(
      "installed",
    );
  });
});

describe("doctor exit codes (#46)", () => {
  // The two CI steps that run doctor have no ~/.agentic-tools. If layout
  // checks failed there instead of skipping, this whole feature would turn CI
  // red on merge.
  test("a source checkout with no install is healthy and exits 0", async () => {
    const { stdout, code } = await doctorIn(home(), ["--format", "text"]);
    expect(code).toBe(0);
    expect(stdout).toContain("healthy");
    expect(stdout).toContain("(source install)");
  });

  test("a broken installed layout exits 2 and names the failures", async () => {
    const h = home();
    mkdirSync(join(h, ".agentic-tools", "structured-editing"), { recursive: true });
    const { stdout, code } = await doctorIn(h, ["--format", "text"]);
    expect(code).toBe(2);
    expect(stdout).toContain("issues found");
    expect(stdout).toContain("core-cli.ts");
    // Every failure carries the command that fixes it.
    expect(stdout).toContain("fix:");
  });

  test("warnings alone exit 1 — degraded, not broken", async () => {
    const h = home();
    mkdirSync(join(h, ".config", "hashpilot"), { recursive: true });
    writeFileSync(
      join(h, ".config", "hashpilot", "config.json"),
      JSON.stringify({ telemetry: { enabled: "yes" } }),
    );
    const { stdout, code } = await doctorIn(h, ["--format", "text"]);
    expect(code).toBe(1);
    expect(stdout).toContain("healthy");
  });
});

describe("doctor report contents (#46)", () => {
  test("JSON reports the real package version, never a hardcoded literal", async () => {
    const { stdout, code } = await doctorIn(home(), ["--format", "json"]);
    expect(code).toBe(0);
    const env = JSON.parse(stdout);
    const pkg = await Bun.file(join(import.meta.dir, "..", "package.json")).json();
    expect(env.data.version).toBe(pkg.version);
    expect(env.data.versions.hashpilot).toBe(pkg.version);
    expect(env.data.versions.bun).toBe(Bun.version);
  });

  test("a skip never makes an install unhealthy", async () => {
    const { stdout } = await doctorIn(home(), ["--format", "json"]);
    const report = JSON.parse(stdout).data;
    expect(report.summary.skip).toBeGreaterThan(0);
    expect(report.summary.fail).toBe(0);
    expect(report.healthy).toBe(true);
  });

  test("tree-sitter bindings are probed per language", async () => {
    const { stdout } = await doctorIn(home(), ["--format", "json"]);
    const report = JSON.parse(stdout).data;
    expect(report.parsers).toHaveLength(6);
    expect(report.parsers.every((p: { loaded: boolean }) => p.loaded)).toBe(true);
    expect(report.checks.find((c: { name: string }) => c.name === "ast-parsers").status).toBe("pass");
  });

  test("the failure envelope carries a DOCTOR_FAILED error with recovery", async () => {
    const h = home();
    mkdirSync(join(h, ".agentic-tools", "structured-editing"), { recursive: true });
    const { stdout, code } = await doctorIn(h, ["--format", "json"]);
    expect(code).toBe(2);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("DOCTOR_FAILED");
    expect(env.error.recovery).toBeTruthy();
  });

  test("text output goes to stdout, leaving stderr clean", async () => {
    const { stdout, stderr } = await doctorIn(home(), ["--format", "text"]);
    expect(stdout).toContain("HashPilot");
    expect(stderr.trim()).toBe("");
  });
});
