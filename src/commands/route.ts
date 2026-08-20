import type { Command } from "commander";
import {
  detectLanguage,
  chooseRoute,
  loadConfig,
  finish,
} from "../core/index";

/** Register the `route` command group. */
export function register(program: Command): void {
  program
    .command("route")
    .description("Show which edit route would be chosen (with detailed explanation)")
    .argument("<file>", "File path")
    .argument("<operation>", "Operation name")
    .option("--policy <json>", "Inline policy JSON to test")
    .option("--no-default-config", "Ignore config file policies")
    .action((file: string, operation: string, opts) => {
      const lang = detectLanguage(file);
      let policy = opts.policy ? JSON.parse(opts.policy) : undefined;
      if (!policy && !opts.defaultConfig) {
        policy = loadConfig().routePolicy;
      }
      const { route, explanation } = chooseRoute(file, operation, policy);
      finish({
        file,
        operation,
        language: lang,
        route,
        explanation,
      });
    });

  program
    .command("config")
    .description("Show current HashPilot configuration")
    .option("--config <path>", "Config file path override")
    .action((opts) => {
      const config = loadConfig(opts.config);
      finish(config);
    });
}
