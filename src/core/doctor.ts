import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { detectLanguage } from "./ast-edit";
import { loadConfig } from "./config";

const HOME = process.env.HOME || "/root";
const AGENTIC_TOOLS = join(HOME, ".agentic-tools");
const CORE_DIR = join(AGENTIC_TOOLS, "structured-editing");
const BIN_DIR = join(AGENTIC_TOOLS, "bin");
const CLI_LAUNCHER = join(BIN_DIR, "structured-edit");
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
}

export interface DoctorReport {
  checks: DoctorCheck[];
  healthy: boolean;
  timestamp: string;
  version: string;
}

const HASH_VERSION = "0.1.0";
const CLAUDE_MARKER = "HashPilot Claude — Structured Editing Integration";

function checkFile(path: string, label: string): DoctorCheck {
  if (existsSync(path)) {
    return { name: label, status: "pass", message: `Found: ${path}` };
  }
  return { name: label, status: "fail", message: `Missing: ${path}` };
}

function checkDir(path: string, label: string): DoctorCheck {
  if (existsSync(path)) {
    return { name: label, status: "pass", message: `Found: ${path}` };
  }
  return { name: label, status: "fail", message: `Missing: ${path}` };
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

  // 1. Core directory
  checks.push(checkDir(CORE_DIR, "core-directory"));

  // 2. Core files — check a few critical files
  checks.push(checkFile(join(CORE_DIR, "src", "cli.ts"), "core-cli.ts"));
  checks.push(checkFile(join(CORE_DIR, "package.json"), "core-package.json"));

  // 3. CLI launcher on PATH
  checks.push(checkFile(CLI_LAUNCHER, "cli-launcher"));

  // 4. Check CLI works
  checks.push(checkCLIExecutable());

  // 5. Config file
  checks.push(...checkConfig());

  // 6. Claude integration
  checks.push(checkClaudeIntegration());

  // 7. OpenCode integration
  checks.push(checkFile(OPENCODE_SKILL, "opencode-skill"));
  checks.push(checkFile(OPENCODE_AGENT, "opencode-agent"));

  // 8. Pi integration
  checks.push(checkFile(PI_EXTENSION, "pi-extension"));
  checks.push(checkFile(PI_SKILL, "pi-skill"));

  // 9. Telemetry directory writable
  checks.push(checkWritable(LOG_DIR, "telemetry-writable"));

  // 10. Manifest
  checks.push(checkFile(MANIFEST, "manifest"));

  const healthy = checks.every((c) => c.status === "pass");

  return { checks, healthy, timestamp, version: HASH_VERSION };
}

function checkCLIExecutable(): DoctorCheck {
  try {
    const proc = Bun.spawnSync(["structured-edit", "--version"], {
      env: { ...process.env, PATH: `${BIN_DIR}:${process.env.PATH || ""}` },
    });
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
