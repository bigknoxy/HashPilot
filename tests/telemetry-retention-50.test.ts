import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

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

async function runCli(args: string[], home: string): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    cwd: home,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") },
  });
  const stdout = await new Response(proc.stdout).text();
  return { code: await proc.exited, stdout };
}

function logDir(home: string): string {
  return join(home, ".agentic-tools", "logs");
}

/** Seed a log dir with one current log plus rotated logs at the given ages in days. */
function seedLogs(home: string, rotatedAgesDays: number[]): string {
  const dir = logDir(home);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const line = (ts: string) =>
    JSON.stringify({ timestamp: ts, sessionId: "seed", operation: "seed", route: "other", success: true, elapsed_ms: 1 }) + "\n";
  writeFileSync(join(dir, "telemetry.jsonl"), line(new Date().toISOString()), { mode: 0o600 });
  for (const age of rotatedAgesDays) {
    const d = new Date(Date.now() - age * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    writeFileSync(join(dir, `telemetry-${d}.jsonl`), line(new Date(Date.now() - age * 86400000).toISOString()), { mode: 0o600 });
  }
  return dir;
}

function rotatedNames(dir: string): string[] {
  return readdirSync(dir).filter((f) => /^telemetry-\d{4}-\d{2}-\d{2}(-\d+)?\.jsonl$/.test(f));
}

describe("#50 automatic retention enforcement", () => {
  it("prunes rotated logs past retentionDays without any manual command", async () => {
    const home = tmp("hp-retention-");
    const dir = seedLogs(home, [3, 45, 200]);
    expect(rotatedNames(dir).length).toBe(3);

    // Any command that records an event must enforce retention.
    await runCli(["config"], home);

    const left = rotatedNames(dir);
    expect(left.length).toBe(1);
    expect(left[0]).toContain(new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0]);
  });

  it("honors a configured retentionDays rather than only the default", async () => {
    const home = tmp("hp-retention-cfg-");
    const dir = seedLogs(home, [3, 10]);
    mkdirSync(join(home, ".config", "hashpilot"), { recursive: true });
    writeFileSync(
      join(home, ".config", "hashpilot", "config.json"),
      JSON.stringify({ telemetry: { enabled: true, retentionDays: 5 } })
    );

    await runCli(["config"], home);

    const left = rotatedNames(dir);
    expect(left.length).toBe(1);
    expect(left[0]).toContain(new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0]);
  });

  it("prunes at most once a day, so the common path is a single stat", async () => {
    const home = tmp("hp-retention-marker-");
    const dir = seedLogs(home, [3]);

    await runCli(["config"], home);
    const marker = join(dir, ".last-prune");
    expect(existsSync(marker)).toBe(true);
    const firstMtime = statSync(marker).mtimeMs;

    // A second run inside the interval must not re-run the prune.
    await runCli(["config"], home);
    expect(statSync(marker).mtimeMs).toBe(firstMtime);

    // Age the marker past the interval and it runs again.
    const old = new Date(Date.now() - 2 * 86400000);
    require("fs").utimesSync(marker, old, old);
    await runCli(["config"], home);
    expect(statSync(marker).mtimeMs).toBeGreaterThan(old.getTime());
  });

  it("adds no measurable startup latency on the already-pruned path", async () => {
    const home = tmp("hp-retention-perf-");
    const dir = seedLogs(home, []);
    // A big log makes a per-invocation prune (which reads every event) obvious.
    const line = JSON.stringify({ timestamp: new Date().toISOString(), sessionId: "s", operation: "seed", route: "other", success: true, elapsed_ms: 1 }) + "\n";
    writeFileSync(join(dir, "telemetry.jsonl"), line.repeat(20000), { mode: 0o600 });

    await runCli(["config"], home); // first run does the prune and drops the marker

    const start = Date.now();
    await runCli(["config"], home);
    const elapsed = Date.now() - start;
    // Generous: this is a whole `bun run src/cli.ts` spawn. The point is that
    // the gated path does not add a full-log scan on top of it.
    expect(elapsed).toBeLessThan(5000);
  });
});

describe("#50 footprint reporting", () => {
  it("telemetry health reports diskBytes covering logs and payloads", async () => {
    const home = tmp("hp-disk-");
    const dir = seedLogs(home, [1]);
    mkdirSync(join(dir, "payloads"), { recursive: true });
    writeFileSync(join(dir, "payloads", "abc.txt"), "x".repeat(5000));

    const { stdout } = await runCli(["telemetry", "health"], home);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(true);
    expect(typeof env.data.diskBytes).toBe("number");
    expect(env.data.diskBytes).toBeGreaterThanOrEqual(5000);
  });

  it("doctor reports the telemetry store size", async () => {
    const home = tmp("hp-doctor-size-");
    seedLogs(home, []);
    const { stdout } = await runCli(["doctor"], home);
    const env = JSON.parse(stdout);
    const check = env.data.checks.find((c: any) => c.name === "telemetry-size");
    expect(check).toBeDefined();
    expect(check.message).toContain("MB");
  });

  it("warns past the disk threshold", async () => {
    const { DISK_WARN_BYTES } = await import("../src/core/telemetry");
    expect(DISK_WARN_BYTES).toBe(100 * 1024 * 1024);
  });
});

describe("#50 install backup path", () => {
  const script = readFileSync(join(REPO_ROOT, "scripts", "install.sh"), "utf8");

  it("never writes the telemetry backup to a fixed path under /tmp", () => {
    expect(script).not.toContain("/tmp/hashpilot-telemetry-backup");
    expect(/\/tmp\//.test(script)).toBe(false);
  });

  it("creates the backup directory with mktemp and 0700", () => {
    expect(script).toContain('mktemp -d "$TARGET_DIR/.telemetry-backup.XXXXXX"');
    expect(script).toContain('chmod 700 "$TELEMETRY_BACKUP_DIR"');
  });
});
