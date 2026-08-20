import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { loadConfig } from "./config";
import { diskUsage, DISK_WARN_BYTES } from "./telemetry";
import { probeParsers } from "./ast-edit";
import pkg from "../../package.json" with { type: "json" };

const HOME = process.env.HOME || "/root";
const AGENTIC_TOOLS = join(HOME, ".agentic-tools");
const CORE_DIR = join(AGENTIC_TOOLS, "structured-editing");
const BIN_DIR = join(AGENTIC_TOOLS, "bin");
const CLI_LAUNCHER = join(BIN_DIR, "hashpilot");
const LOG_DIR = join(AGENTIC_TOOLS, "logs");
const MANIFEST = join(AGENTIC_TOOLS, "manifest.json");
const CONFIG_DIR = join(HOME, ".config", "hashpilot");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const CLAUDE_FILE = join(HOME, ".claude", "CLAUDE.md");
const OPENCODE_SKILL = join(HOME, ".config", "opencode", "skills", "hashpilot", "SKILL.md");
const OPENCODE_AGENT = join(HOME, ".config", "opencode", "agent", "hashpilot.md");
const PI_EXTENSION = join(HOME, ".pi", "agent", "extensions", "hashpilot.ts");
const PI_SKILL = join(HOME, ".pi", "agent", "skills", "hashpilot", "SKILL.md");

export interface DoctorCheck {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  /** Exact command that fixes this check. Required on every `fail` (#46). */
  remediation?: string;
}

/**
 * How this HashPilot is being run. The `~/.agentic-tools` layout checks only
 * mean something for an `installed` copy — reporting them as failures when a
 * contributor runs `bun run src/cli.ts doctor` from a checkout, or when a user
 * installed via `npm i -g`, is a false alarm that makes the exit code useless
 * as a gate (#46).
 */
export type InstallMode = "installed" | "source" | "package";

export interface DoctorReport {
  checks: DoctorCheck[];
  /** True when no check failed. Warnings and skips do not make an install unhealthy. */
  healthy: boolean;
  timestamp: string;
  version: string;
  installMode: InstallMode;
  summary: { pass: number; fail: number; warn: number; skip: number };
  versions: Record<string, string>;
  parsers: { lang: string; loaded: boolean; error?: string }[];
  configPaths: { global: string; project: string; inUse: string[] };
  /**
   * 0 healthy · 1 warnings only · 2 one or more failures. Doctor is meant to be
   * a CI gate and the installer's final verification step, so the health has to
   * reach the shell (#46).
   */
  exitCode: 0 | 1 | 2;
  errorCode?: string;
  message?: string;
  recovery?: string;
}

const HASH_VERSION: string = pkg.version;
const CLAUDE_MARKER = "HashPilot Claude — Structured Editing Integration";

function checkFile(path: string, label: string, remediation?: string): DoctorCheck {
  if (existsSync(path)) {
    return { name: label, status: "pass", message: `Found: ${path}` };
  }
  return { name: label, status: "fail", message: `Missing: ${path}`, remediation };
}

const checkDir = checkFile;

/**
 * A check that only applies to an installed layout. Outside one it reports
 * `skip` with the reason, so `bun run src/cli.ts doctor` in a checkout and
 * `hashpilot doctor` from an npm install both stay exit 0 (#46).
 */
function whenInstalled(mode: InstallMode, label: string, run: () => DoctorCheck): DoctorCheck {
  if (mode === "installed") return run();
  return {
    name: label,
    status: "skip",
    message: mode === "source"
      ? "Running from a source checkout — installed layout not expected"
      : "Running from an npm package — ~/.agentic-tools layout not expected",
  };
}

/**
 * An adapter integration that is simply not installed is not a broken
 * HashPilot. Nobody has every agent host on one machine, so a missing Pi
 * extension used to fail an otherwise-perfect install (#46).
 */
function checkOptionalFile(path: string, label: string, what: string): DoctorCheck {
  if (existsSync(path)) return { name: label, status: "pass", message: `Found: ${path}` };
  return { name: label, status: "skip", message: `${what} not installed` };
}

/**
 * Where this HashPilot is running from. `installed` means the script lives
 * under `~/.agentic-tools`; `package` means a node_modules tree (npm install);
 * anything else is a working checkout.
 */
export function detectInstallMode(dir: string = import.meta.dir): InstallMode {
  if (dir.startsWith(AGENTIC_TOOLS + "/")) return "installed";
  if (dir.includes("/node_modules/")) return "package";
  return existsSync(CORE_DIR) ? "installed" : "source";
}

function checkWritable(path: string, label: string): DoctorCheck {
  try {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
    const testFile = join(path, `.doctor-write-test-${Date.now()}`);
    writeFileSync(testFile, "");
    try { rmSync(testFile); } catch {}
    return { name: label, status: "pass", message: `Writable: ${path}` };
  } catch {
    return { name: label, status: "fail", message: `Not writable: ${path}` };
  }
}

export function doctor(): DoctorReport {
  const checks: DoctorCheck[] = [];
  const timestamp = new Date().toISOString();
  const installMode = detectInstallMode();
  const install = (label: string, run: () => DoctorCheck) => checks.push(whenInstalled(installMode, label, run));

  // 1-3. Installed layout: core files, launcher, PATH, and a live CLI probe.
  install("core-directory", () => checkDir(CORE_DIR, "core-directory", "Reinstall: curl -fsSL https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/install.sh | bash"));
  install("core-cli.ts", () => checkFile(join(CORE_DIR, "src", "cli.ts"), "core-cli.ts", "Reinstall HashPilot"));
  install("core-package.json", () => checkFile(join(CORE_DIR, "package.json"), "core-package.json", "Reinstall HashPilot"));
  install("cli-launcher", () => checkFile(CLI_LAUNCHER, "cli-launcher", "Run `bun run install-cli`"));
  install("bin-on-path", checkPathEntry);
  install("cli-executable", checkCLIExecutable);

  // 4. Config
  checks.push(...checkConfig());

  // 5. Agent host integrations — optional by nature.
  checks.push(checkClaudeIntegration());
  checks.push(checkOptionalFile(OPENCODE_SKILL, "opencode-skill", "OpenCode"));
  checks.push(checkOptionalFile(OPENCODE_AGENT, "opencode-agent", "OpenCode"));
  checks.push(checkOptionalFile(PI_EXTENSION, "pi-extension", "Pi"));
  checks.push(checkOptionalFile(PI_SKILL, "pi-skill", "Pi"));

  // 6. Telemetry store
  checks.push(checkWritable(LOG_DIR, "telemetry-writable"));
  checks.push(checkTelemetrySize());
  install("manifest", () => checkFile(MANIFEST, "manifest", "Reinstall HashPilot"));

  // 7. tree-sitter bindings. `getParser` swallows load errors and the router
  // silently downgrades AST -> diff, so this is the only place a broken native
  // build is visible before edit quality quietly drops (#46).
  const parsers = probeParsers();
  const broken = parsers.filter((p) => !p.loaded);
  checks.push(
    broken.length === 0
      ? { name: "ast-parsers", status: "pass", message: `All ${parsers.length} tree-sitter parsers load` }
      : {
          name: "ast-parsers",
          status: "fail",
          message: `${broken.length}/${parsers.length} parsers failed to load: ${broken.map((p) => `${p.lang} (${p.error})`).join(", ")}`,
          remediation: "Run `bun install` to rebuild the tree-sitter native bindings",
        },
  );

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    warn: checks.filter((c) => c.status === "warn").length,
    skip: checks.filter((c) => c.status === "skip").length,
  };
  // A skip is "does not apply here", not "broken". Requiring every check to
  // pass marked a perfectly good install unhealthy whenever the user had no
  // config file or no Pi (#46).
  const healthy = summary.fail === 0;
  const exitCode: 0 | 1 | 2 = summary.fail > 0 ? 2 : summary.warn > 0 ? 1 : 0;

  const failed = checks.filter((c) => c.status === "fail");
  return {
    checks,
    healthy,
    timestamp,
    version: HASH_VERSION,
    installMode,
    summary,
    versions: { hashpilot: HASH_VERSION, bun: Bun.version, node: process.versions.node },
    parsers,
    configPaths: {
      global: CONFIG_FILE,
      project: join(process.cwd(), ".hashpilot.json"),
      inUse: [CONFIG_FILE, join(process.cwd(), ".hashpilot.json")].filter((p) => existsSync(p)),
    },
    exitCode,
    ...(failed.length > 0
      ? {
          errorCode: "DOCTOR_FAILED",
          message: `${failed.length} check(s) failed: ${failed.map((c) => c.name).join(", ")}`,
          recovery: failed.find((c) => c.remediation)?.remediation,
        }
      : {}),
  };
}

/**
 * Report the telemetry store's size. Retention is enforced automatically, but
 * a machine that was never pruned by an older version — or one running with a
 * long `retentionDays` — can still be carrying hundreds of megabytes nobody
 * knows about (#50). A warn, never a fail: a large log is not a broken install.
 */
function checkTelemetrySize(): DoctorCheck {
  const bytes = diskUsage();
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  if (bytes > DISK_WARN_BYTES) {
    return {
      name: "telemetry-size",
      status: "warn",
      message: `Telemetry store is ${mb} MB (threshold ${(DISK_WARN_BYTES / (1024 * 1024)).toFixed(0)} MB) — run 'hashpilot telemetry prune' or lower telemetry.retentionDays`,
    };
  }
  return { name: "telemetry-size", status: "pass", message: `Telemetry store is ${mb} MB` };
}

/**
 * The launcher existing is not the same as it being runnable. `install-cli`
 * used to create the symlink and stop, leaving `hashpilot` unresolvable in a
 * fresh shell while every other check passed. Report that as its own failure
 * with the exact line to add.
 */
function checkPathEntry(): DoctorCheck {
  const entries = (process.env.PATH || "").split(":").filter(Boolean);
  if (entries.includes(BIN_DIR)) {
    return { name: "bin-on-path", status: "pass", message: `${BIN_DIR} is on PATH` };
  }
  return {
    name: "bin-on-path",
    status: "fail",
    message: `${BIN_DIR} is not on PATH. Run \`bun run install-cli\`, or add: export PATH="$HOME/.agentic-tools/bin:$PATH"`,
  };
}

function checkCLIExecutable(): DoctorCheck {
  try {
    // Invoke the launcher by absolute path: this check is about whether the
    // CLI runs at all. PATH resolution is `checkPathEntry`'s job, and injecting
    // BIN_DIR here is what used to hide a broken install.
    const proc = Bun.spawnSync([CLI_LAUNCHER, "--version"]);
    if (proc.exitCode === 0) {
      return { name: "cli-executable", status: "pass", message: `CLI works: ${proc.stdout.toString().trim()}` };
    }
    return { name: "cli-executable", status: "fail", message: `CLI exited with code ${proc.exitCode}: ${proc.stderr.toString().trim()}` };
  } catch (e: any) {
    return { name: "cli-executable", status: "fail", message: `Cannot run CLI: ${e.message}` };
  }
}

function checkConfig(): DoctorCheck[] {
  const results: DoctorCheck[] = [];
  const cfgExists = existsSync(CONFIG_FILE);
  if (cfgExists) {
    results.push(checkFile(CONFIG_FILE, "config-file"));
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      results.push({ name: "config-parseable", status: "pass", message: "Config is valid JSON" });
      if (cfg.telemetry && typeof cfg.telemetry.enabled !== "boolean") {
        results.push({ name: "config-telemetry-type", status: "warn", message: "telemetry.enabled should be boolean" });
      }
      if (cfg.routePolicy) {
        results.push({ name: "config-has-policy", status: "pass", message: "Route policy configured" });
      }
    } catch {
      results.push({ name: "config-parseable", status: "fail", message: "Config is not valid JSON" });
    }
  } else {
    results.push({ name: "config-file", status: "skip", message: "No config file — using defaults" });
  }
  // Verify loadConfig() works regardless
  try {
    const cfg = loadConfig();
    results.push({ name: "config-loadable", status: "pass", message: "Config defaults load correctly" });
  } catch {
    results.push({ name: "config-loadable", status: "fail", message: "Cannot load config" });
  }
  return results;
}

function checkClaudeIntegration(): DoctorCheck {
  if (!existsSync(CLAUDE_FILE)) {
    return { name: "claude-integration", status: "skip", message: "Claude CLAUDE.md not found — not installed" };
  }
  try {
    const content = readFileSync(CLAUDE_FILE, "utf-8");
    if (content.includes(CLAUDE_MARKER)) {
      return { name: "claude-integration", status: "pass", message: "HashPilot section found in CLAUDE.md" };
    }
    return { name: "claude-integration", status: "warn", message: "CLAUDE.md exists but HashPilot section missing" };
  } catch {
    return { name: "claude-integration", status: "fail", message: "Cannot read CLAUDE.md" };
  }
}
