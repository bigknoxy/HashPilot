import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");
const SMOKE = readFileSync(join(REPO_ROOT, "tests", "smoke.sh"), "utf8");
const CI = readFileSync(join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8");

// #130: smoke.sh parsed the pre-envelope output shape and had been failing
// 23 of 26 cases on main, unnoticed, because nothing ran it. These assertions
// keep both halves of that fix — envelope-aware parsing and a CI gate — from
// regressing quietly again.
describe("#130 — the AST smoke test is envelope-aware and gated", () => {
  it("unwraps the envelope in one place instead of at each call site", () => {
    expect(SMOKE).toContain("hp_check()");
    expect(SMOKE).toContain('e.get(\'apiVersion\') == \'1\'');
    // A bare `json.load(sys.stdin)['<payload field>']` reads the envelope, not
    // the payload. The only permitted direct loads are inside the helpers.
    const naive = SMOKE.match(/json\.load\(sys\.stdin\)\s*\[\s*'(?!data)/g) ?? [];
    expect(naive).toEqual([]);
  });

  it("asserts refusals fail rather than merely returning a payload", () => {
    expect(SMOKE).toContain("hp_check_refusal()");
    expect(SMOKE).toContain("refusal reported ok:true");
  });

  it("asks for --include-source when it inspects the post-edit file", () => {
    for (const line of SMOKE.split("\n")) {
      if (!line.includes("newSource")) continue;
      if (line.trimStart().startsWith("#")) continue;
      expect(line).toContain("--include-source");
    }
  });

  it("exits non-zero on failure without wrapping past 255", () => {
    expect(SMOKE).toContain('[ "$FAIL" -eq 0 ] || exit 1');
    expect(SMOKE).not.toContain("exit $FAIL");
  });

  it("runs in CI", () => {
    expect(CI).toContain("bash tests/smoke.sh");
  });
});
