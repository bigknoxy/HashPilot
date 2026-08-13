#!/usr/bin/env node
// Node-parseable entry point for the `structured-edit` binary.
//
// HashPilot runs on Bun (src/cli.ts has a `#!/usr/bin/env bun` shebang and uses
// Bun-only APIs). Pointing `bin` straight at the TypeScript source means
// `npm i -g hashpilot` on a Node-only machine installs cleanly and then dies with
// a syntax error on first use. This shim is deliberately plain CommonJS so any
// Node >= 14 can parse it, and its only job is to hand off to Bun — or, when Bun
// is absent, to say so in one actionable line instead of a stack trace.
//
// `.cjs` (not `.js`) because package.json declares `"type": "module"`.
// See issue #35, Option A.

"use strict";

var path = require("path");
var spawnSync = require("child_process").spawnSync;

var CLI = path.join(__dirname, "cli.ts");

// Array argv, never a shell string: arguments routinely contain source code,
// spaces, quotes, and newlines, and a shell would both mangle and execute them.
var res = spawnSync("bun", ["run", CLI].concat(process.argv.slice(2)), {
  stdio: "inherit",
});

if (res.error && res.error.code === "ENOENT") {
  process.stderr.write(
    "structured-edit requires Bun (>= 1.2.0), which was not found on your PATH.\n" +
      "\n" +
      "  Install it:  curl -fsSL https://bun.sh/install | bash\n" +
      "  Then reopen your shell and re-run this command.\n" +
      "\n" +
      "HashPilot is Bun-only today; see the support matrix in the README.\n"
  );
  process.exit(127);
}

if (res.error) {
  process.stderr.write("structured-edit: failed to launch Bun: " + res.error.message + "\n");
  process.exit(70);
}

// Propagate the child's exit status verbatim. HashPilot's exit codes are a
// documented contract (0 ok · 1 usage · 2 edit failed · 3 stale · 4 verify
// failed · 5 I/O · 70 internal); collapsing them to 0/1 would break every
// caller that branches on code 3 to retry a stale anchor.
if (res.signal) {
  process.exit(128 + (require("os").constants.signals[res.signal] || 0));
}
process.exit(res.status === null ? 70 : res.status);
