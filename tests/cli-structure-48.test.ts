import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");
const COMMANDS_DIR = join(REPO_ROOT, "src", "commands");

function commandModules(): string[] {
  return readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".ts"));
}

function allSources(): { file: string; text: string }[] {
  return commandModules().map((f) => ({ file: f, text: readFileSync(join(COMMANDS_DIR, f), "utf8") }));
}

// #48: `src/cli.ts` had grown to ~1400 lines with the provenance flag trio
// copy-pasted onto nine commands and `resolveContent` defined twice. These
// assertions pin the split so the duplication cannot creep back in.
describe("#48 — cli.ts is wiring, command groups are modules", () => {
  it("cli.ts stays small and holds no command actions", () => {
    const src = readFileSync(join(REPO_ROOT, "src", "cli.ts"), "utf8");
    expect(src.split("\n").length).toBeLessThan(300);
    expect(src).not.toContain(".action(");
  });

  it("every command module exports a register(program) entry point", () => {
    const modules = commandModules().filter((f) => f !== "shared.ts");
    expect(modules.length).toBeGreaterThanOrEqual(10);
    for (const { file, text } of allSources()) {
      if (file === "shared.ts") continue;
      expect(text).toContain("export function register(program: Command)");
    }
  });

  it("cli.ts registers every command module", () => {
    const src = readFileSync(join(REPO_ROOT, "src", "cli.ts"), "utf8");
    for (const file of commandModules()) {
      if (file === "shared.ts") continue;
      expect(src).toContain(`from "./commands/${file.replace(/\.ts$/, "")}"`);
    }
  });

  it("the provenance flag trio is declared exactly once", () => {
    const declarations = allSources().flatMap(({ text }) => text.match(/\.option\("--task-id/g) ?? []);
    expect(declarations.length).toBe(1);
    const shared = readFileSync(join(COMMANDS_DIR, "shared.ts"), "utf8");
    expect(shared).toContain("--task-id");
    expect(shared).toContain("export function withProvenance");
  });

  it("resolveContent has a single definition, in core", () => {
    const defs = allSources().filter(({ text }) => /function resolveContent/.test(text));
    expect(defs.map((d) => d.file)).toEqual([]);
    const core = readFileSync(join(REPO_ROOT, "src", "core", "resolve-content.ts"), "utf8");
    expect(core).toContain("export async function resolveContent");
  });
});
