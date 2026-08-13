#!/usr/bin/env node
// Node-compatible shim for HashPilot CLI.
// When Bun is available, forwards execution to the Bun-managed CLI.
// When Bun is not available, prints an actionable message and exits cleanly.

"use strict";

// Helper: check whether the `bun` command is on PATH.
function bunOnPath() {
  try {
    // ` Bun` isn't a node module, so we just verify the executable exists.
    require("child_process").execSync("bun --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// If Bun is on PATH, forward to the real CLI.
// We use `bun run` wrapper so that shebang/internal state is honoured.
if (bunOnPath()) {
  try {
    // Re-execute via bun with the original arguments.
    const { execSync } = require("child_process");
    const args = process.argv.slice(2); // skip node + shim path
    if (args.length === 0) {
      // No args: just show help / version via bun
      execSync("bun run src/cli.ts --help", { stdio: "inherit" });
    } else {
      execSync(`bun run src/cli.ts ${args.join(" ")}`, { stdio: "inherit" });
    }
    process.exit(0);
  } catch (e) {
    // Bun forwarded execution failed — fall through to the message below.
    console.error(
      "HashPilot: error forwarding execution to Bun. Is your Bun installation intact?"
    );
    process.exit(1);
  }
}

// Bun not detectable on PATH — user needs to install it.
const missing =
  "HashPilot requires Bun >= 1.2.0 to run.\n\n" +
  "Please install Bun from https://bun.sh\n" +
  "After installing, you may need to restart your shell so the $PATH picks up the new binary.\n";

console.error(missing);
process.exit(1);
