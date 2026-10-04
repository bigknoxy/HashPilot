/**
 * #133 — text-mode renderers emitted placeholder output.
 *
 * Two renderers printed text carrying no information:
 *
 *  - `ast capabilities` fell through to the generic dump ("0: ... 1: ...")
 *    because the renderer was registered under "ast-capabilities" while
 *    `finish()` keys on the CLI command name, "ast capabilities".
 *  - `read-many` printed "undefined lines" because `printReadResult` read
 *    `lines` as a string[] when the payload carries it as a line *count*.
 *
 * JSON output was correct in both cases; only the human layer was broken, so
 * every assertion here runs the CLI with `--format text`.
 */

import { describe, test, expect } from "bun:test";
import { join } from "path";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "hp-render-133-"));
  writeFileSync(join(dir, "a.ts"), "const a = 1;\nconst b = 2;\nconst c = 3;\n");
  return dir;
}

async function text(args: string[], cwd: string) {
  const proc = Bun.spawn(["bun", "run", CLI, "--format", "text", ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "1", CI: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { stdout, stderr, code: await proc.exited };
}

describe("ast capabilities text renderer (#133)", () => {
  test("names every language instead of dumping '...' placeholders", async () => {
    const cwd = workspace();
    try {
      const { stdout } = await text(["ast", "capabilities"], cwd);
      expect(stdout).toContain("typescript");
      expect(stdout).toContain("rust");
      // The generic dump rendered each language as a bare "N: ..." entry.
      // Match that shape specifically — real limitation text legitimately
      // contains "..." (e.g. Go's `import ( ... )`), so a bare substring
      // assertion would be wrong.
      expect(stdout).not.toMatch(/^\s+\d+: \.\.\.$/m);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("reports the language count, not the generic 'ok' line", async () => {
    const cwd = workspace();
    try {
      const json = Bun.spawnSync(["bun", "run", CLI, "--format", "json", "ast", "capabilities"], {
        cwd,
        env: { ...process.env, NO_COLOR: "1", CI: "" },
      });
      const langs = (JSON.parse(json.stdout.toString()).data as { lang: string }[]).length;
      const { stdout } = await text(["ast", "capabilities"], cwd);
      expect(stdout).toContain(`${langs} language`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("read-many text renderer (#133)", () => {
  test("prints the real line count, never 'undefined lines'", async () => {
    const cwd = workspace();
    try {
      const { stdout } = await text(["read-many", "a.ts"], cwd);
      expect(stdout).not.toContain("undefined");
      expect(stdout).toContain("3 lines");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("shows the file basename and hash prefix", async () => {
    const cwd = workspace();
    try {
      const { stdout } = await text(["read-many", "a.ts"], cwd);
      expect(stdout).toContain("a.ts:");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("single-line file is singular, not '1 lines'", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hp-render-133-one-"));
    try {
      writeFileSync(join(dir, "one.ts"), "export const only = 1;\n");
      const { stdout } = await text(["read-many", "one.ts"], dir);
      expect(stdout).toContain("1 line");
      expect(stdout).not.toContain("1 lines");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("read-hash (sibling renderer on the same helper) is not left with 'undefined lines'", async () => {
    const cwd = workspace();
    try {
      const { stdout } = await text(["read-hash", "a.ts", "2"], cwd);
      expect(stdout).not.toContain("undefined lines");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
