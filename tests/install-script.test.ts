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
