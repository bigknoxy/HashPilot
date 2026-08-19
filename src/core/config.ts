import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { EditRoute } from "./router";

export interface RoutePolicy {
  /** Force a specific route for given languages. E.g. { "python": "hash" } */
  languageOverrides?: Record<string, EditRoute>;
  /** Force a specific route for given operations. E.g. { "add-import": "diff" } */
  operationOverrides?: Record<string, EditRoute>;
  /** When multiple overrides match, which wins: "language" | "operation" | "strictest" */
  conflictResolution?: "language" | "operation" | "strictest";
}

export interface TelemetryConfig {
  enabled?: boolean;
  maxFileSize?: number;
  maxRotatedFiles?: number;
  retentionDays?: number;
  /**
   * Cap on one serialized JSONL record, in bytes. Oversized payloads (a
   * captured diff) are stored out-of-line by hash and referenced from the
   * record, so the log stays a log rather than an object store (#20).
   */
  maxRecordBytes?: number;
}

export interface ProvenanceConfig {
  /** Default actor identity when not provided at invocation */
  defaultActor?: string;
  /** Max length of stored context field (prevents log bloat), default 500 */
  maxContextLength?: number;
  /**
   * Record a unified diff of every edit in the telemetry log. Off by default:
   * a diff puts real source lines on disk in plaintext, which is a leak for
   * private repos and anything holding credentials. Turn on deliberately.
   */
  captureDiffs?: boolean;
}

export interface SnapshotConfig {
  /** Take a pre-edit snapshot of every written file so `undo` can restore it. Default true. */
  enabled?: boolean;
  /** Keep at most this many changeSets, default 200. */
  maxChangeSets?: number;
  /** Drop changeSets older than this many days, default 7. */
  maxAgeDays?: number;
}

export interface HashPilotConfig {
  routePolicy?: RoutePolicy;
  telemetry?: TelemetryConfig;
  provenance?: ProvenanceConfig;
  snapshots?: SnapshotConfig;
  /** Extra directories writes may target, beyond the project root. Relative entries resolve against cwd. */
  allowedRoots?: string[];
}

const DEFAULT_CONFIG: HashPilotConfig = {
  telemetry: { enabled: true, maxFileSize: 10 * 1024 * 1024, maxRotatedFiles: 10, retentionDays: 30, maxRecordBytes: 4096 },
};

const ROUTE_PRECEDENCE: EditRoute[] = ["diff", "hash", "ast"];

function resolveConflict(
  fromLang: EditRoute | undefined,
  fromOp: EditRoute | undefined,
  method: "language" | "operation" | "strictest" = "operation"
): EditRoute | undefined {
  if (!fromLang && !fromOp) return undefined;
  if (!fromOp) return fromLang;
  if (!fromLang) return fromOp;
  if (method === "language") return fromLang;
  if (method === "operation") return fromOp;
  // strictest: lowest precedence wins (diff < hash < ast)
  return ROUTE_PRECEDENCE.indexOf(fromLang) <= ROUTE_PRECEDENCE.indexOf(fromOp)
    ? fromLang
    : fromOp;
}

export function policyForce(
  policy: RoutePolicy | undefined,
  language: string | null,
  operation: string
): EditRoute | undefined {
  if (!policy) return undefined;
  const fromLang = language ? policy.languageOverrides?.[language] : undefined;
  const fromOp = policy.operationOverrides?.[operation];
  if (!fromLang && !fromOp) return undefined;
  return resolveConflict(fromLang, fromOp, policy.conflictResolution);
}

export function loadConfig(configPath?: string): HashPilotConfig {
  const paths: string[] = [];

  // Global config
  const globalDir = join(process.env.HOME || "/root", ".config", "hashpilot");
  const globalPath = join(globalDir, "config.json");
  if (existsSync(globalPath)) paths.push(globalPath);

  // Project config (cwd)
  const projectPath = join(process.cwd(), ".hashpilot.json");
  if (existsSync(projectPath) && projectPath !== globalPath) paths.push(projectPath);

  // CLI override
  if (configPath && existsSync(configPath) && !paths.includes(configPath)) {
    paths.push(configPath);
  }

  const config: HashPilotConfig = { ...DEFAULT_CONFIG };

  for (const p of paths) {
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      mergeConfig(config, data);
    } catch {}
  }

  // Environment variable override
  const envPolicy = process.env.HASHPILOT_ROUTE_POLICY;
  if (envPolicy) {
    try {
      const parsed = JSON.parse(envPolicy);
      mergeConfig(config, { routePolicy: parsed });
    } catch {}
  }

  return config;
}

function mergeConfig(base: HashPilotConfig, override: Partial<HashPilotConfig>): void {
  if (override.telemetry) {
    base.telemetry = { ...base.telemetry, ...override.telemetry };
  }
  if (override.routePolicy) {
    const basePolicy = base.routePolicy || {};
    base.routePolicy = {
      ...basePolicy,
      conflictResolution: override.routePolicy.conflictResolution ?? basePolicy.conflictResolution,
      languageOverrides: { ...basePolicy.languageOverrides, ...override.routePolicy.languageOverrides },
      operationOverrides: { ...basePolicy.operationOverrides, ...override.routePolicy.operationOverrides },
    };
  }
  if (override.provenance) {
    base.provenance = { ...base.provenance, ...override.provenance };
  }
  if (override.snapshots) {
    base.snapshots = { ...base.snapshots, ...override.snapshots };
  }
  if (override.allowedRoots) {
    base.allowedRoots = [...(base.allowedRoots || []), ...override.allowedRoots];
  }
}
