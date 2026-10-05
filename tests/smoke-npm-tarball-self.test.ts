import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");
const SMOKE = readFileSync(join(REPO_ROOT, "tests", "smoke.sh"), "utf8");
const GUARD_PATH = join(REPO_ROOT, "tests", "lib", "install-version-guard.sh");

// #202: the smoke test's npm-path scenario installed `@latest` from the real
// registry. On an unpublished branch that resolves to the *previous* release,
// so the check passed while validating code the branch had not shipped —
// which is exactly how v4.8.2's install-path break (D007/D010) reached the
// registry with main's CI green. The guard below is what makes that failure
// mode loud: the install is fed the branch's own packed tarball, and the
// installed version is asserted against the branch's package.json.
describe("#202 — the npm-path smoke validates the branch's own tarball", () => {
  it("extracts the version guard into a sourceable script", () => {
    expect(existsSync(GUARD_PATH)).toBe(true);
  });

  // Behavioral, not structural: the guard is shell, so it is exercised by
  // running it against real directories rather than grepping its source.
  it("passes only when the installed version equals the branch version", () => {
    const root = mkdtempSync(join(tmpdir(), "hashpilot-guard-"));
    try {
      const installed = join(root, "structured-editing");
      mkdirSync(installed);
      writeFileSync(join(installed, "package.json"), JSON.stringify({ name: "x", version: "4.8.4" }));

      const run = (expected: string) =>
        Bun.spawnSync(
          ["bash", "-c", `. "${GUARD_PATH}"; assert_installed_version_matches "${installed}" "${expected}"`],
          { stderr: "pipe" },
        );

      const match = run("4.8.4");
      expect(match.exitCode).toBe(0);

      const mismatch = run("4.8.5");
      expect(mismatch.exitCode).not.toBe(0);
      // The message has to name both versions, or a reader cannot tell
      // "testing the wrong release" from "install is broken".
      const stderr = mismatch.stderr.toString();
      expect(stderr).toContain("4.8.5");
      expect(stderr).toContain("4.8.4");
      expect(stderr).toContain("wrong release");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads the top-level version, not one nested in dependencies", () => {
    // install.sh's `json_field` greps for the FIRST `"version": "..."` in the
    // file. A greedy `.*` in sed would instead take the LAST match on the line,
    // which for a single-line manifest is a dependency's version — the guard
    // would then compare the wrong field while looking like it worked.
    const root = mkdtempSync(join(tmpdir(), "hashpilot-guard-nested-"));
    try {
      const installed = join(root, "structured-editing");
      mkdirSync(installed);
      writeFileSync(
        join(installed, "package.json"),
        JSON.stringify({ version: "4.8.4", dependencies: { a: { version: "9.9.9" } } }),
      );
      const r = Bun.spawnSync(
        ["bash", "-c", `. "${GUARD_PATH}"; assert_installed_version_matches "${installed}" "4.8.4"`],
        { stderr: "pipe" },
      );
      expect(r.stderr.toString()).not.toContain("9.9.9");
      expect(r.exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when the install produced no package.json at all", () => {
    // A missing manifest is the same class of mistake as a mismatched one:
    // the check cannot be shown to have validated anything.
    const root = mkdtempSync(join(tmpdir(), "hashpilot-guard-empty-"));
    try {
      const installed = join(root, "structured-editing");
      mkdirSync(installed);
      const r = Bun.spawnSync(
        ["bash", "-c", `. "${GUARD_PATH}"; assert_installed_version_matches "${installed}" "4.8.4"`],
        { stderr: "pipe" },
      );
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr.toString()).toContain("no package.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when the install manifest is unreadable", () => {
    const root = mkdtempSync(join(tmpdir(), "hashpilot-guard-garbage-"));
    try {
      const installed = join(root, "structured-editing");
      mkdirSync(installed);
      writeFileSync(join(installed, "package.json"), "{ not json at all");
      const r = Bun.spawnSync(
        ["bash", "-c", `. "${GUARD_PATH}"; assert_installed_version_matches "${installed}" "4.8.4"`],
        { stderr: "pipe" },
      );
      expect(r.exitCode).not.toBe(0);
      // Assert the guard's own diagnostic, not merely a non-zero exit: a
      // missing guard script also exits non-zero, and that must not read as
      // this case passing.
      expect(r.stderr.toString()).toContain("unreadable");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("packs the branch's own tarball instead of installing @latest", () => {
    // @latest is the whole bug: it is the previously published release
    // whenever the branch is unpublished. The old scenario 1 reached the real
    // registry by default, so the assertion is scoped to that scenario's lines
    // — "npm pack" appearing elsewhere in the file proves nothing.
    expect(SMOKE).not.toMatch(/registry\.npmjs\.org/);
    const start = SMOKE.indexOf("install.sh source routing");
    const end = SMOKE.indexOf("# ── 1. Language detection");
    // Both markers asserted: if the end marker ever drifts, indexOf returns
    // -1 and the slice runs to EOF-1, silently turning these section-scoped
    // assertions back into whole-file ones.
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = SMOKE.slice(start, end);
    // Must be an actual `npm pack` invocation, not a prose mention — the
    // section's own comments contain the phrase "npm package", which a bare
    // substring check would happily accept.
    expect(section).toMatch(/=\s*\$\(cd "\$REPO_ROOT" && npm pack\b/);
    // The local tarball is served from a throwaway registry rooted at a
    // temp dir, never the public one.
    expect(section).not.toMatch(/https:\/\/registry\.npmjs\.org/);
  });

  it("points the installer at the local tarball registry", () => {
    expect(SMOKE).toContain("HASHPILOT_NPM_REGISTRY=");
    // The version assertion is the required post-check; a version string
    // alone is not enough without the comparison against the branch.
    expect(SMOKE).toContain("assert_installed_version_matches");
  });

  it("sources the guard and actually invokes it", () => {
    // Sourcing the file is not the same as running the check: a smoke that
    // defines the guard and never calls it is the exact silent-pass shape
    // this issue is about, so both halves are required.
    expect(SMOKE).toMatch(/^\s*\. "\$REPO_ROOT\/tests\/lib\/install-version-guard\.sh"/m);
    const calls = SMOKE.split("\n").filter(
      (l) => l.includes("assert_installed_version_matches") && !l.trimStart().startsWith("#"),
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // And it must feed the guard a real comparison, not a literal that
    // always matches.
    expect(SMOKE).toMatch(/assert_installed_version_matches[^\n]*"\$PKG_VERSION"/);
  });
});
