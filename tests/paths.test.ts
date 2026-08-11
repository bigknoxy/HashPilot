import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, symlinkSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import {
  assertWritable,
  assertAllWritable,
  safeWrite,
  findProjectRoot,
  configureWriteBoundary,
  resetWriteBoundary,
  PathDeniedError,
} from "../src/core/paths";

const ROOT = join(import.meta.dir, "__tmp_test_paths__");
const OUTSIDE = join(tmpdir(), "hashpilot-outside-root");

beforeEach(() => {
  resetWriteBoundary();
  mkdirSync(ROOT, { recursive: true });
  mkdirSync(OUTSIDE, { recursive: true });
  writeFileSync(join(ROOT, "in.ts"), "x");
});

afterEach(() => {
  resetWriteBoundary();
  rmSync(ROOT, { recursive: true, force: true });
  rmSync(OUTSIDE, { recursive: true, force: true });
});

describe("assertWritable containment", () => {
  test("allows a path inside the project root", () => {
    expect(assertWritable(join(ROOT, "in.ts"))).toContain("in.ts");
  });

  test("allows a file that does not exist yet inside the root", () => {
    expect(assertWritable(join(ROOT, "nested", "new.ts"))).toContain("new.ts");
  });

  test("rejects a path outside the project root", () => {
    expect(() => assertWritable(join(OUTSIDE, "escape.ts"))).toThrow(PathDeniedError);
  });

  test("rejects traversal that climbs out of the root", () => {
    expect(() => assertWritable(join(ROOT, "..", "..", "..", "escape.ts"))).toThrow(PathDeniedError);
  });

  test("a sibling directory sharing a name prefix is not inside an allowed root", () => {
    // /foo/bar-baz must not count as inside /foo/bar — a prefix string compare
    // would wrongly allow it.
    const sibling = `${OUTSIDE}-sibling`;
    mkdirSync(sibling, { recursive: true });
    try {
      expect(() => assertWritable(join(sibling, "file.ts"), { allowedRoots: [OUTSIDE] })).toThrow(PathDeniedError);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  test("allowedRoots widens the boundary", () => {
    expect(assertWritable(join(OUTSIDE, "ok.ts"), { allowedRoots: [OUTSIDE] })).toContain("ok.ts");
  });

  test("allowOutsideRoot bypasses containment", () => {
    expect(assertWritable(join(OUTSIDE, "ok.ts"), { allowOutsideRoot: true, quiet: true })).toContain("ok.ts");
  });

  test("configureWriteBoundary supplies process-wide defaults", () => {
    configureWriteBoundary({ allowedRoots: [OUTSIDE] });
    expect(assertWritable(join(OUTSIDE, "ok.ts"))).toContain("ok.ts");
  });
});

describe("assertWritable hard-deny", () => {
  const denied = [
    join(homedir(), ".ssh", "id_rsa"),
    join(homedir(), ".aws", "credentials"),
    join(homedir(), ".zshrc"),
    join(homedir(), ".agentic-tools", "logs", "telemetry.jsonl"),
    "/etc/passwd",
  ];

  for (const target of denied) {
    test(`refuses ${target}`, () => {
      expect(() => assertWritable(target, { allowOutsideRoot: true, quiet: true })).toThrow(PathDeniedError);
    });
  }

  test("allowedRoots cannot re-enable a hard-denied path", () => {
    const ssh = join(homedir(), ".ssh");
    expect(() => assertWritable(join(ssh, "config"), { allowedRoots: [ssh] })).toThrow(PathDeniedError);
  });

  test("hard-deny is case-insensitive on macOS", () => {
    if (process.platform !== "darwin") return;
    expect(() => assertWritable("/ETC/passwd", { allowOutsideRoot: true, quiet: true })).toThrow(PathDeniedError);
  });
});

describe("assertWritable input validation", () => {
  test("rejects an empty path", () => {
    expect(() => assertWritable("")).toThrow(PathDeniedError);
  });

  test("rejects a path containing a null byte", () => {
    expect(() => assertWritable(join(ROOT, "a\0b.ts"))).toThrow(PathDeniedError);
  });
});

describe("symlink resolution", () => {
  test("a symlinked directory inside the root that points outside is rejected", () => {
    const link = join(ROOT, "link");
    symlinkSync(OUTSIDE, link);
    expect(() => assertWritable(join(link, "escape.ts"))).toThrow(PathDeniedError);
  });
});

describe("assertAllWritable", () => {
  test("reports every rejection, not just the first", () => {
    try {
      assertAllWritable([join(OUTSIDE, "a.ts"), join(OUTSIDE, "b.ts")]);
      throw new Error("expected PathDeniedError");
    } catch (err) {
      expect(err).toBeInstanceOf(PathDeniedError);
      expect((err as PathDeniedError).message).toContain("a.ts");
      expect((err as PathDeniedError).message).toContain("b.ts");
    }
  });
});

describe("safeWrite", () => {
  test("writes an allowed path and returns the resolved destination", async () => {
    const written = await safeWrite(join(ROOT, "out.ts"), "hello");
    expect(await Bun.file(written).text()).toBe("hello");
  });

  test("refuses a denied path and writes nothing", async () => {
    const target = join(OUTSIDE, "nope.ts");
    await expect(safeWrite(target, "hello")).rejects.toThrow(PathDeniedError);
    expect(await Bun.file(target).exists()).toBe(false);
  });
});

describe("findProjectRoot", () => {
  test("finds the nearest ancestor containing .git", () => {
    expect(findProjectRoot(import.meta.dir)).toBe(
      require("fs").realpathSync(join(import.meta.dir, "..")),
    );
  });
});
