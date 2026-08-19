import { describe, expect, test, afterEach } from "bun:test";
import { join } from "path";
import { doctor } from "../src/core/doctor";

const BIN_DIR = join(process.env.HOME || "/root", ".agentic-tools", "bin");
const ORIGINAL_PATH = process.env.PATH;

function pathCheck() {
  return doctor().checks.find((c) => c.name === "bin-on-path")!;
}

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});

describe("doctor — bin directory on PATH", () => {
  test("fails, with the fix, when the bin dir is missing from PATH", () => {
    // The symlink existing is not an install: before this check, `install-cli`
    // linked the launcher and stopped, so `hashpilot` was unresolvable in a
    // fresh shell while doctor reported the launcher as fine.
    process.env.PATH = (ORIGINAL_PATH || "")
      .split(":")
      .filter((p) => p !== BIN_DIR)
      .join(":");
    const check = pathCheck();
    expect(check.status).toBe("fail");
    expect(check.message).toContain("install-cli");
  });

  test("passes when the bin dir is on PATH", () => {
    process.env.PATH = `${BIN_DIR}:${ORIGINAL_PATH || ""}`;
    expect(pathCheck().status).toBe("pass");
  });
});
