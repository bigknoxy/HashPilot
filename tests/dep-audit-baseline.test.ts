import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The `Security` workflow runs `bun audit --audit-level=high` on every PR and
 * on `main` itself. That gate was red on `main`: five high-severity advisories
 * in transitive dependencies (`brace-expansion` via `glob › minimatch`, and
 * `undici` via `@semantic-release/github` and `@semantic-release/npm`), which
 * blocked every open PR regardless of its own diff.
 *
 * `package.json` `overrides` is the only lever available without reaching into
 * a transitive parent's own range, so the pinned floor for each advisory is a
 * contract: a future `bun update` that drops an override silently re-breaks the
 * audit gate, and these tests are what notice.
 */
const ROOT = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  overrides?: Record<string, string>;
};

/** package name -> advisory floor. Keep in sync with the `overrides` block. */
const ADVISORY_FLOORS: Record<string, string> = {
  // GHSA-qhr7-859c-m2p7 / GHSA-6j4f-fj2g-mc7p — uncontrolled recursion DoS.
  "brace-expansion": "^5.0.11",
  // GHSA-rfgv-xxqx-mfg5 / GHSA-w293-vg96-wgc3 — WebSocket subprotocol DoS and
  // TLS certificate validation bypass in BalancedPool.
  undici: "^7.29.1",
};

describe("dependency audit baseline", () => {
  test("every package with a known high-severity advisory is overridden", () => {
    const overridden = pkg.overrides ?? {};
    const missing = Object.keys(ADVISORY_FLOORS).filter(
      (name) => !(name in overridden),
    );
    expect(missing).toEqual([]);
  });

  test("each override floor is at or above the patched version", () => {
    const parseMajor = (range: string): number => {
      const m = range.match(/(\d+)\.(\d+)\.(\d+)/);
      if (!m) throw new Error(`override is not a concrete version: ${range}`);
      return Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]);
    };
    for (const [name, floor] of Object.entries(ADVISORY_FLOORS)) {
      const actual = pkg.overrides?.[name];
      expect(actual, `${name} must be pinned`).toBeDefined();
      expect(parseMajor(actual!)).toBeGreaterThanOrEqual(parseMajor(floor));
    }
  });

  test("the lockfile resolves the overridden packages to a patched version", () => {
    const lock = readFileSync(join(ROOT, "bun.lock"), "utf8");
    for (const name of Object.keys(ADVISORY_FLOORS)) {
      // `bun.lock` records resolutions as `"name": ["name@version", ...]`.
      const resolved = [...lock.matchAll(
        new RegExp(`"${name}":\\s*\\[[^\\]]*?@(\\d+\\.\\d+\\.\\d+)`, "g"),
      )].map((m) => m[1]);
      expect(resolved.length, `${name} must appear in bun.lock`).toBeGreaterThan(0);
      for (const version of resolved) {
        const [maj, min, pat] = version.split(".").map(Number);
        const floor = ADVISORY_FLOORS[name].match(/(\d+)\.(\d+)\.(\d+)/)!;
        const ok =
          maj > Number(floor[1]) ||
          (maj === Number(floor[1]) &&
            (min > Number(floor[2]) ||
              (min === Number(floor[2]) && pat >= Number(floor[3]))));
        expect(ok, `${name}@${version} is below the patched ${ADVISORY_FLOORS[name]}`).toBe(true);
      }
    }
  });
});