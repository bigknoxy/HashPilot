import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { loadConfig, policyForce } from "../src/core/config";
import { getSessionId, newSession, setSessionId } from "../src/core/telemetry";

const REPO_ROOT = resolve(import.meta.dir, "..");
const CLI = join(REPO_ROOT, "src/cli.ts");
const scratch: string[] = [];

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratch) { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
});

/** Run the CLI with an isolated HOME so config and telemetry never touch the real ones. */
async function runCli(args: string[], home: string, cwd = home): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") },
  });
  const stdout = await new Response(proc.stdout).text();
  return { code: await proc.exited, stdout };
}

function telemetryEvents(home: string): any[] {
  const log = join(home, ".agentic-tools", "logs", "telemetry.jsonl");
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// ── Item 1: shared mutable default config ────────────────────────────

describe("#51 item 1 — loadConfig returns no shared state", () => {
  // Run in a child with an empty HOME: with a real global config present,
  // mergeConfig happens to rebuild the nested objects and hides the aliasing.
  // The leak only shows when nothing overrides the defaults.
  async function probe(): Promise<{ leaked: boolean; aliased: boolean }> {
    const home = tmp("hp-51-clone-");
    const script = join(home, "probe.ts");
    writeFileSync(
      script,
      `import { loadConfig } from ${JSON.stringify(join(REPO_ROOT, "src/core/config.ts"))};\n` +
        "const a = loadConfig();\n" +
        "const before = a.telemetry!.maxRecordBytes;\n" +
        "a.telemetry!.maxRecordBytes = 1;\n" +
        "const b = loadConfig();\n" +
        "console.log(JSON.stringify({ leaked: b.telemetry!.maxRecordBytes !== before, aliased: a.telemetry === b.telemetry }));\n",
    );
    const proc = Bun.spawn(["bun", "run", script], {
      cwd: home,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") },
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return JSON.parse(out.trim());
  }

  it("mutating a resolved config does not leak into the next load", async () => {
    expect((await probe()).leaked).toBe(false);
  }, 60_000);

  it("two loads share no nested object", async () => {
    expect((await probe()).aliased).toBe(false);
  }, 60_000);
});

// ── Item 2: route policy overrides can be removed ────────────────────

describe("#51 item 2 — null unsets an inherited route override", () => {
  it("project config removes a global language override", async () => {
    const home = tmp("hp-51-cfg-");
    mkdirSync(join(home, ".config", "hashpilot"), { recursive: true });
    writeFileSync(
      join(home, ".config", "hashpilot", "config.json"),
      JSON.stringify({ routePolicy: { languageOverrides: { python: "diff", go: "hash" } } }),
    );
    const project = join(home, "proj");
    mkdirSync(project);
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "p" }));
    writeFileSync(join(project, ".hashpilot.json"), JSON.stringify({ routePolicy: { languageOverrides: { python: null } } }));

    const out = await runCli(["config"], home, project);
    const cfg = JSON.parse(out.stdout);
    const overrides = cfg.data.routePolicy.languageOverrides;
    expect(overrides.python).toBeUndefined();
    expect(overrides.go).toBe("hash");
  });

  it("policyForce ignores an unset override", () => {
    expect(policyForce({ languageOverrides: { python: null } }, "python", "rename-symbol")).toBeUndefined();
    expect(policyForce({ languageOverrides: { python: "diff" } }, "python", "rename-symbol")).toBe("diff");
  });
});

// ── Item 3: elapsed_ms is measured, never a hardcoded zero ───────────

describe("#51 item 3 — elapsed_ms is measured", () => {
  it("no command hardcodes elapsed_ms: 0", () => {
    // Command actions moved to `src/commands/*.ts` in #48; scan every module
    // plus the CLI wiring so the check follows the code.
    const dir = join(REPO_ROOT, "src/commands");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    const src = [...files.map((f) => readFileSync(join(dir, f), "utf8")), readFileSync(join(REPO_ROOT, "src/cli.ts"), "utf8")].join("\n");
    expect(src).not.toContain("elapsed_ms: 0");
  });
});

// ── Item 6: the session id is not permanent ──────────────────────────

describe("#51 item 6 — session id is resettable", () => {
  it("newSession issues a fresh id", () => {
    const first = getSessionId();
    const second = newSession();
    expect(second).not.toBe(first);
    expect(getSessionId()).toBe(second);
  });

  it("setSessionId adopts a host-supplied id and rejects an empty one", () => {
    setSessionId("task-42");
    expect(getSessionId()).toBe("task-42");
    expect(() => setSessionId("")).toThrow();
    newSession();
  });
});

// ── Item 7: every command records a telemetry event ──────────────────

// The `telemetry` subtree reads and clears the log; writing an event there
// would skew the very report the command produces. `uninstall` removes the log.
const COMMANDS: Array<{ argv: string[]; label: string }> = [
  { argv: ["ast", "capabilities"], label: "ast capabilities" },
  { argv: ["config"], label: "config" },
  { argv: ["changesets"], label: "changesets" },
  { argv: ["doctor"], label: "doctor" },
];

describe("#51 item 7 — telemetry coverage", () => {
  it("commands that recorded nothing now emit exactly one event", async () => {
    for (const cmd of COMMANDS) {
      const home = tmp("hp-51-tel-");
      await runCli(cmd.argv, home);
      const events = telemetryEvents(home);
      expect({ cmd: cmd.label, count: events.length }).toEqual({ cmd: cmd.label, count: 1 });
      expect(events[0].elapsed_ms).toBeGreaterThan(0);
    }
  }, 120_000);

  it("route, symbol-lookup-many and provenance query each record an event", async () => {
    const home = tmp("hp-51-tel2-");
    writeFileSync(join(home, "package.json"), JSON.stringify({ name: "p" }));
    writeFileSync(join(home, "a.ts"), "export function greet(): void {}\n");
    await runCli(["route", "a.ts", "rename-symbol"], home);
    await runCli(["symbol-lookup-many", ".", "--names", "greet"], home);
    await runCli(["provenance", "query", "a.ts"], home);
    const ops = telemetryEvents(home).map((e) => e.operation);
    expect(ops).toContain("route");
    expect(ops).toContain("symbol-lookup-many");
    expect(ops).toContain("provenance query");
  }, 120_000);

  it("reading telemetry does not write telemetry", async () => {
    const home = tmp("hp-51-tel3-");
    await runCli(["ast", "capabilities"], home);
    const before = telemetryEvents(home).length;
    await runCli(["telemetry", "summary"], home);
    expect(telemetryEvents(home).length).toBe(before);
  }, 120_000);
});
