/**
 * CLI ↔ MCP parity (#25).
 *
 * The MCP surface is derived from `OPERATIONS`. This asserts the other half of
 * that claim: every operation names a CLI command that actually exists, and
 * every parameter it declares corresponds to a real argument or option on that
 * command. A tool that promises a parameter the CLI does not have is a
 * divergence, and a divergence in an agent-facing contract is silent until an
 * agent hits it.
 *
 * The CLI is inspected through its own `--help`, not by importing `cli.ts` —
 * importing it would run `program.parse()` on the test runner's argv.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "path";
import { OPERATIONS, inputSchemaFor } from "../src/core/operations";

const REPO = join(import.meta.dir, "..");

async function help(path: string[]): Promise<string> {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", ...path, "--help"], {
    cwd: REPO,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
  await proc.exited;
  return out;
}

/** camelCase → the kebab-case spelling Commander uses for flags and arguments. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

const helpText = new Map<string, string>();

beforeAll(async () => {
  // One spawn per distinct command, reused across the assertions below.
  const paths = [...new Set(OPERATIONS.map((o) => o.cliCommand.join(" ")))];
  await Promise.all(
    paths.map(async (p) => helpText.set(p, await help(p.split(" "))))
  );
}, 60000);

describe("registry ↔ CLI parity", () => {
  test("every operation maps to a CLI command that exists", () => {
    for (const op of OPERATIONS) {
      const key = op.cliCommand.join(" ");
      const text = helpText.get(key)!;
      // Commander prints the ROOT usage when a command path is unknown, so a
      // usage line naming the command is what proves it resolved.
      expect(text).toContain(`Usage: hashpilot ${key}`);
    }
  });

  test("every declared parameter exists on its CLI command", () => {
    const problems: string[] = [];
    for (const op of OPERATIONS) {
      const text = helpText.get(op.cliCommand.join(" "))!;
      // Everything before "Options:" is the usage line (positional arguments);
      // after it are the flags. Both count as the command's parameter surface.
      for (const p of op.params) {
        const k = kebab(p.name);
        const present =
          text.includes(`--${k}`) ||
          // Commander spells a default-on boolean as its negation, e.g.
          // `scopeTests` ← `--no-scope-tests`.
          text.includes(`--no-${k}`) ||
          text.includes(`<${k}>`) ||
          text.includes(`<${k}...>`) ||
          text.includes(`[${k}]`) ||
          // Plural positionals: `files` ← `<files...>`, `paths` ← `<paths...>`.
          text.includes(`<${k}...>`) ||
          // Optional plural positionals, used where a flag form also exists:
          // `paths` ← `[paths...]` on `grep-many` (#57).
          text.includes(`[${k}...]`);
        if (!present) problems.push(`${op.name}.${p.name} (no --${k} or <${k}> on "${op.cliCommand.join(" ")}")`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("tool names are unique and stable in shape", () => {
    const names = OPERATIONS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  test("every mutating operation accepts provenance and dryRun", () => {
    // An MCP caller must not lose the accountability a CLI caller gets.
    for (const op of OPERATIONS.filter((o) => o.mutates && o.name !== "verify_changes")) {
      const names = op.params.map((p) => p.name);
      expect(names).toContain("actor");
      expect(names).toContain("taskId");
      expect(names).toContain("reason");
      expect(names).toContain("dryRun");
    }
  });

  test("generated schemas are valid JSON Schema objects", () => {
    for (const op of OPERATIONS) {
      const schema = inputSchemaFor(op) as any;
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      for (const p of op.params) {
        const prop = schema.properties[p.name];
        expect(prop).toBeDefined();
        expect(prop.description.length).toBeGreaterThan(10);
        if (p.type === "string[]") {
          expect(prop.type).toBe("array");
          expect(prop.items.type).toBe("string");
        } else {
          expect(prop.type).toBe(p.type);
        }
      }
    }
  });

  test("every edit operation the CLI routes is reachable as a tool", () => {
    // The operation list `route-edit` documents is the canonical set; if one is
    // added there and not here, MCP callers silently cannot reach it.
    const routed = [
      "rename-symbol", "replace-body", "add-import", "remove-import",
      "insert-before", "insert-after", "replace-hash", "replace-content",
    ];
    const toolNames = new Set(OPERATIONS.map((o) => o.name));
    for (const r of routed) {
      expect(toolNames.has(r.replace(/-/g, "_"))).toBe(true);
    }
  });
});
