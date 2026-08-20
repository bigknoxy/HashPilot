import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const installSh = readFileSync(join(import.meta.dir, "..", "scripts", "install.sh"), "utf8");

describe("install.sh — CLI launcher", () => {
  test("removes an existing launcher entry before writing the new one", () => {
    // `bun run install-cli` leaves ~/.agentic-tools/bin/hashpilot as a symlink
    // into the checkout. `>` follows symlinks, so writing the launcher without
    // unlinking first overwrote the repo's own src/cli-node.cjs — observed on a
    // real machine, not hypothetical.
    const rmIdx = installSh.indexOf('rm -f "$TARGET_DIR/bin/hashpilot"');
    const catIdx = installSh.indexOf('cat > "$TARGET_DIR/bin/hashpilot"');
    expect(rmIdx).toBeGreaterThan(-1);
    expect(catIdx).toBeGreaterThan(-1);
    expect(rmIdx).toBeLessThan(catIdx);
  });

  test("a redirect through a symlink still writes to the link target", () => {
    // Guards the assumption the fix rests on: if this ever stopped being true,
    // the `rm -f` above would be unnecessary and the test above misleading.
    const dir = join(import.meta.dir, "..", ".hashpilot-test-tmp");
    const target = join(dir, "launcher-target.txt");
    const link = join(dir, "launcher-link");
    Bun.spawnSync(["mkdir", "-p", dir]);
    Bun.spawnSync(["rm", "-f", target, link]);
    Bun.spawnSync(["bash", "-c", `echo original > "${target}"; ln -sf "${target}" "${link}"; echo replaced > "${link}"`]);
    expect(readFileSync(target, "utf8").trim()).toBe("replaced");
    Bun.spawnSync(["rm", "-f", target, link]);
  });
});

describe("install.sh — doctor gate (#137)", () => {
  test("captures doctor's exit code instead of letting set -e abort", () => {
    // The gate ran as a bare `DOCTOR_OUT=$(... doctor ...)`. Under `set -e` a
    // non-zero command substitution kills the script, so a doctor finding
    // ended the installer at exit 2 with no message at all — after every file
    // had already been written.
    expect(installSh).toContain("set -eu");
    expect(installSh).toMatch(/DOCTOR_OUT=\$\([^\n]*doctor[^\n]*\) \|\| DOCTOR_CODE=\$\?/);
  });

  test("set -e really does abort on a failing command substitution", () => {
    // Guards the assumption the fix rests on.
    const bare = Bun.spawnSync(["bash", "-c", "set -e; OUT=$(exit 3); echo reached"]);
    expect(bare.stdout.toString()).not.toContain("reached");
    const guarded = Bun.spawnSync(["bash", "-c", "set -e; CODE=0; OUT=$(exit 3) || CODE=$?; echo reached-$CODE"]);
    expect(guarded.stdout.toString()).toContain("reached-3");
  });

  test("doctor runs with the freshly installed bin dir on PATH", () => {
    // The PATH entry is written to the shell rc, which the installer process
    // never sources — so `bin-on-path` would fail at exactly the moment it
    // cannot yet succeed, reporting a healthy install as broken.
    expect(installSh).toContain('PATH="$TARGET_DIR/bin:$PATH" "$TARGET_DIR/bin/hashpilot" --format text doctor');
  });
});
