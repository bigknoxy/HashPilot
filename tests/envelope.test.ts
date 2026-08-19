import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Every command emits the same envelope, and `ok` never disagrees with the exit
 * code. Before this, each command returned its own shape — some a bare array,
 * some an object — so an adapter had to special-case the command it just ran
 * (#18, #56). The sweep below is the enforcement: a new command that forgets
 * `finish()` fails here.
 */

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "schema", "hashpilot-envelope.schema.json"), "utf8"));

const ERROR_CODES: string[] = SCHEMA.properties.error.oneOf[1].properties.code.enum;
const WARNING_CODES: string[] = SCHEMA.properties.warnings.items.properties.code.enum;
const ENVELOPE_KEYS: string[] = SCHEMA.required;

let dir = "";
let home = "";

function run(args: string[]) {
  const res = spawnSync("bun", ["run", CLI, ...args], {
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, HOME: home },
  });
  return { code: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/**
 * Structural validation against schema/hashpilot-envelope.schema.json. Written
 * by hand rather than pulled in as a validator dependency: the schema is small,
 * and the codes are read out of the file, so the two cannot drift.
 */
function expectValidEnvelope(stdout: string, exitCode: number) {
  const env = JSON.parse(stdout);
  expect(Object.keys(env).sort()).toEqual([...ENVELOPE_KEYS].sort());
  expect(env.apiVersion).toBe("1");
  expect(typeof env.command).toBe("string");
  expect(env.command.length).toBeGreaterThan(0);
  expect(typeof env.ok).toBe("boolean");
  // The contract an adapter relies on: one of `ok` and `$?` is redundant.
  expect(env.ok).toBe(exitCode === 0);
  if (env.ok) {
    expect(env.error).toBeNull();
  } else {
    expect(env.error).not.toBeNull();
    expect(ERROR_CODES).toContain(env.error.code);
    expect(typeof env.error.message).toBe("string");
    expect(env.error.message.length).toBeGreaterThan(0);
  }
  expect(Array.isArray(env.warnings)).toBe(true);
  for (const w of env.warnings) {
    expect(WARNING_CODES).toContain(w.code);
    expect(typeof w.message).toBe("string");
  }
  return env;
}

/** One invocation per leaf command. `help` is commander's, not ours. */
const INVOCATIONS: Array<[name: string, args: string[]]> = [
  ["read-many", ["read-many", "sample.ts"]],
  ["read-hash", ["read-hash", "sample.ts", "1"]],
  ["grep-many", ["grep-many", "alpha", "sample.ts"]],
  ["symbol-lookup-many", ["symbol-lookup-many", "sample.ts", "--names", "alpha"]],
  ["replace-hash (stale)", ["replace-hash", "sample.ts", "0".repeat(12), "x"]],
  ["ast capabilities", ["ast", "capabilities"]],
  ["ast find-symbols", ["ast", "find-symbols", "sample.ts"]],
  ["ast rename-symbol", ["ast", "rename-symbol", "sample.ts", "alpha", "renamed"]],
  ["ast replace-body", ["ast", "replace-body", "sample.ts", "alpha", "return 2;"]],
  ["ast add-import", ["ast", "add-import", "sample.ts", "join", "path"]],
  ["ast remove-import", ["ast", "remove-import", "sample.ts", "join", "path"]],
  ["ast insert-before", ["ast", "insert-before", "sample.ts", "alpha", "// note"]],
  ["ast insert-after", ["ast", "insert-after", "sample.ts", "alpha", "// note"]],
  ["route", ["route", "sample.ts", "rename-symbol"]],
  ["route-edit", ["route-edit", "sample.ts", "rename-symbol", "--symbol", "alpha", "--new-name", "beta"]],
  ["batch", ["batch", "rename-symbol", "sample.ts", "--symbol", "alpha", "--new-name", "beta"]],
  ["intent", ["intent", '{"operation":"add-parameter","symbol":"alpha","param":{"name":"x","type":"number"}}', "--dry-run"]],
  ["diff generate", ["diff", "generate", "sample.ts", "old", "new"]],
  ["diff apply", ["diff", "apply", "sample.ts", "--patch", "nonexistent.patch"]],
  ["verify-changes", ["verify-changes", "sample.ts"]],
  ["telemetry show", ["telemetry", "show"]],
  ["telemetry summary", ["telemetry", "summary"]],
  ["telemetry health", ["telemetry", "health"]],
  ["telemetry sessions", ["telemetry", "sessions"]],
  ["telemetry export", ["telemetry", "export"]],
  ["telemetry prune", ["telemetry", "prune"]],
  ["telemetry clear", ["telemetry", "clear"]],
  ["provenance query", ["provenance", "query", "sample.ts"]],
  ["provenance changeset", ["provenance", "changeset", "nonexistent-id"]],
  ["changesets", ["changesets"]],
  ["undo", ["undo", "nonexistent-changeset"]],
  ["doctor", ["doctor", "--json"]],
  ["config", ["config"]],
  ["upgrade", ["upgrade", "--dry-run"]],
  ["uninstall", ["uninstall", "--dry-run"]],
];

describe("the envelope is uniform across every command", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hashpilot-env-"));
    home = mkdtempSync(join(tmpdir(), "hashpilot-envhome-"));
    mkdirSync(join(home, ".agentic-tools", "logs"), { recursive: true });
    writeFileSync(
      join(dir, "sample.ts"),
      'import { dirname } from "path";\n\nexport function alpha(): number {\n  return dirname("/a").length;\n}\n',
    );
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  for (const [name, args] of INVOCATIONS) {
    test(`${name} emits a valid envelope`, () => {
      const res = run(args);
      expect(res.stdout.trim().length).toBeGreaterThan(0);
      expectValidEnvelope(res.stdout, res.code);
    });
  }

  /**
   * `mcp` owns stdout for the whole process: it is a JSON-RPC stream, and an
   * envelope written into it would corrupt the protocol. It is the one command
   * that legitimately emits no envelope, and its own framing is covered by
   * `tests/mcp-server.test.ts`. Any other exemption is a bug.
   */
  const NO_ENVELOPE = new Set(["mcp"]);

  test("every leaf command in --help is covered by the sweep", () => {
    // Otherwise a new command ships unvalidated and nobody notices.
    const covered = new Set(INVOCATIONS.map(([, args]) => args.slice(0, 2).join(" ")));
    const help = run(["--help"]).stdout;
    const groups = ["ast", "diff", "telemetry", "provenance"];
    const top = help
      .slice(help.indexOf("Commands:"))
      .split("\n")
      .slice(1)
      // Only lines at the command indent — deeper lines are wrapped description text.
      .map((l) => /^ {2}(\S+)/.exec(l)?.[1])
      .filter((c): c is string => Boolean(c) && c !== "help");

    for (const cmd of top) {
      if (NO_ENVELOPE.has(cmd)) continue;
      if (groups.includes(cmd)) {
        const sub = run([cmd, "--help"]).stdout;
        const leaves = sub
          .slice(sub.indexOf("Commands:"))
          .split("\n")
          .slice(1)
          .map((l) => /^ {2}(\S+)/.exec(l)?.[1])
          .filter((c): c is string => Boolean(c) && c !== "help");
        for (const leaf of leaves) expect([...covered]).toContain(`${cmd} ${leaf}`);
      } else {
        expect([...covered].some((c) => c.split(" ")[0] === cmd)).toBe(true);
      }
    }
  }, 60_000);

  test("a route fallback is reported as a warning, not silently", () => {
    // An AST edit that quietly became a hash edit used to be indistinguishable
    // from one that stayed on the AST route.
    writeFileSync(join(dir, "notes.txt"), "alpha\n");
    const res = run(["route-edit", "notes.txt", "rename-symbol", "--symbol", "alpha", "--new-name", "beta"]);
    const env = expectValidEnvelope(res.stdout, res.code);
    expect(env.warnings.map((w: { code: string }) => w.code)).toContain("ROUTE_FALLBACK");
  });

  test("error.recovery carries the next step for a recoverable failure", () => {
    const res = run(["replace-hash", "sample.ts", "0".repeat(12), "x", "--range", "1"]);
    const env = expectValidEnvelope(res.stdout, res.code);
    expect(env.error.code).toBe("STALE_ANCHOR");
    expect(typeof env.error.recovery).toBe("string");
    expect(env.error.recovery.length).toBeGreaterThan(0);
  });
});
