import type { Command } from "commander";
import {
  health,
  doctor,
  finish,
  ExitCode,
  getOutputFormat,
} from "../core/index";
import { writeFileSync, rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/** Register the `maintenance` command group. */
export function register(program: Command): void {
  program
    .command("doctor")
    .description("Verify HashPilot installation health")

    .action(() => {
      // Both formats go through finish(): it is the only place that sets the
      // process exit code, and the old console.log bypass is why `doctor`
      // always exited 0 no matter how broken the install was (#46).
      const report = doctor();
      finish(report, report.exitCode as ExitCode);
    });

  program
    .command("upgrade")
    .description("Upgrade HashPilot to the latest version from GitHub")
    .option("--channel <channel>", "Release channel (default: main)", "main")
    .option("--target <dir>", "Install target directory (default: ~/.agentic-tools)")
    .option("--keep-telemetry", "Preserve existing telemetry on upgrade")
    .option("--force", "Skip confirmation prompt")
    .option("--dry-run", "Show what would be done without executing")
    .action(async (opts) => {
      const channel = opts.channel;
      const targetDir = opts.target || join(process.env.HOME || "/root", ".agentic-tools");
      const keepTelemetry = opts.keepTelemetry;
      const force = opts.force;
      const dryRun = opts.dryRun;

      const installUrl = `https://raw.githubusercontent.com/bigknoxy/HashPilot/${channel}/scripts/install.sh`;
      console.error(`Upgrading HashPilot from ${channel}...`);
      console.error(`Target: ${targetDir}`);

      if (dryRun) {
        finish({ success: true, message: "Dry run - would upgrade", dryRun: true, channel, targetDir, keepTelemetry, force });
        console.error("Dry run - would upgrade");
        return;
      }

      try {
        const response = await fetch(installUrl);
        if (!response.ok) {
          throw new Error(`Failed to download install script: ${response.status} ${response.statusText}`);
        }
        const script = await response.text();

        // Write script to temp file and execute
        const tmpScript = join(targetDir, `.hashpilot-upgrade-${Date.now()}.sh`);
        writeFileSync(tmpScript, script, { mode: 0o755 });

        const args = ["--target", targetDir];
        if (keepTelemetry) args.push("--keep-telemetry");
        if (force) args.push("--force");

        const proc = Bun.spawn(["bash", tmpScript, ...args], {
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            PATH: `${join(targetDir, "bin")}:${process.env.PATH || ""}`,
            // A non-default channel means the user wants that exact git ref
            // (e.g. bleeding-edge branch testing) — install.sh skips its
            // npm-primary source fetch entirely when this is set to
            // anything other than "main", since npm's published releases
            // can't provide an arbitrary branch.
            ...(channel !== "main" ? { HASHPILOT_SOURCE_CHANNEL: channel } : {}),
          },
        });

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        try { rmSync(tmpScript); } catch {}

        if (stdout) console.error(stdout.trim());
        if (stderr) console.error(stderr.trim());

        if (exitCode !== 0) {
          finish({ success: false, error: `Upgrade failed with exit code ${exitCode}` }, ExitCode.INTERNAL);
          return;
        }

        finish({ success: true, message: "Upgrade completed successfully" });
        console.error("Upgrade completed successfully");
      } catch (e: any) {
        finish({ success: false, error: e.message }, ExitCode.INTERNAL);
        console.error(`Upgrade failed: ${e.message}`);
      }
    });

  program
    .command("uninstall")
    .description("Remove HashPilot and all its components from the system")
    .option("--keep-config", "Preserve config and telemetry data")
    .option("--force", "Skip confirmation prompt (auto-detected when piped)")
    .option("--dry-run", "Show what would be removed without deleting anything")
    .option("--target <dir>", "Install target directory (default: ~/.agentic-tools)")

    .action(async (opts) => {
      const targetDir = opts.target || join(process.env.HOME || "/root", ".agentic-tools");

      if (opts.dryRun) {
        const components: string[] = [];
        const keep = Boolean(opts.keepConfig);
        const kept = (label: string) => keep ? `${label} [preserved by --keep-config]` : label;
        if (existsSync(join(targetDir, "bin", "hashpilot"))) components.push(`CLI launcher: ${targetDir}/bin/hashpilot`);
        if (existsSync(join(targetDir, "structured-editing"))) components.push(`Core source: ${targetDir}/structured-editing`);
        components.push(kept(`Telemetry logs: ${targetDir}/logs`));
        if (existsSync(join(targetDir, "manifest.json"))) components.push(`Manifest: ${targetDir}/manifest.json`);
        components.push(kept("Config: ~/.config/hashpilot/config.json"));
        if (existsSync(join(process.env.HOME || "/root", ".claude", "CLAUDE.md")))
          components.push("Claude integration: ~/.claude/CLAUDE.md (section removal)");
        if (existsSync(join(process.env.HOME || "/root", ".config", "opencode", "skills", "hashpilot", "SKILL.md")))
          components.push("OpenCode skill: ~/.config/opencode/skills/hashpilot/SKILL.md");
        if (existsSync(join(process.env.HOME || "/root", ".config", "opencode", "agent", "hashpilot.md")))
          components.push("OpenCode agent: ~/.config/opencode/agent/hashpilot.md");
        if (existsSync(join(process.env.HOME || "/root", ".pi", "agent", "extensions", "hashpilot.ts")))
          components.push("Pi extension: ~/.pi/agent/extensions/hashpilot.ts");
        if (existsSync(join(process.env.HOME || "/root", ".pi", "agent", "skills", "hashpilot", "SKILL.md")))
          components.push("Pi skill: ~/.pi/agent/skills/hashpilot/SKILL.md");
        finish({
          success: true,
          dryRun: true,
          keepConfig: Boolean(opts.keepConfig),
          targetDir,
          components: components.length > 0 ? components : ["Nothing to remove — no HashPilot installation detected."],
        });
        return;
      }

      const uninstallUrl = `https://raw.githubusercontent.com/bigknoxy/HashPilot/main/scripts/uninstall.sh`;
      console.error(`Uninstalling HashPilot from ${targetDir}...`);

      if (!opts.force && process.stdin.isTTY) {
        console.error("This will remove HashPilot and all its components.");
        console.error(`  Target: ${targetDir}`);
        console.error(`  Keep config: ${Boolean(opts.keepConfig)}`);
        console.error("  Pass --force to skip this prompt.");
      }

      try {
        const response = await fetch(uninstallUrl);
        if (!response.ok) {
          throw new Error(`Failed to download uninstall script: ${response.status} ${response.statusText}`);
        }
        const script = await response.text();

        const tmpScript = join(targetDir, `.hashpilot-uninstall-${Date.now()}.sh`);
        try { mkdirSync(join(targetDir), { recursive: true }); } catch {}
        writeFileSync(tmpScript, script, { mode: 0o755 });

        const args: string[] = [];
        if (opts.target) args.push("--target", opts.target);
        if (opts.keepConfig) args.push("--keep-config");
        if (opts.force || !process.stdin.isTTY) args.push("--force");

        const proc = Bun.spawn(["bash", tmpScript, ...args], {
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            HASHPILOT_DIR: targetDir,
            PATH: `${join(targetDir, "bin")}:${process.env.PATH || ""}`,
          },
        });

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        try { rmSync(tmpScript); } catch {}

        if (stdout) console.error(stdout.trim());
        if (stderr) console.error(stderr.trim());

        if (exitCode !== 0) {
          finish({ success: false, error: `Uninstall failed with exit code ${exitCode}` }, ExitCode.INTERNAL);
          return;
        }

        finish({ success: true, message: "HashPilot uninstalled successfully" });
        console.error("Uninstall completed successfully");
      } catch (e: any) {
        finish({ success: false, error: e.message }, ExitCode.INTERNAL);
        console.error(`Uninstall failed: ${e.message}`);
      }
    });
}
