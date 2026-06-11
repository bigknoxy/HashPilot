import { exportEvents, type TelemetryEvent } from "./telemetry";
import { computeHash } from "./read";
import { generateUnifiedDiff } from "./diff-engine";
import { loadConfig, type HashPilotConfig } from "./config";

// ── Types ──────────────────────────────────────────────────────────────

export interface ProvenanceInput {
  actor?: string;
  taskId?: string;
  changeSetId?: string;
  reason?: string;
  source?: string;
  newSource?: string;
  stepIndex?: number;
  stepTotal?: number;
  context?: string;
  filePath?: string;
}

export interface ProvenanceEntry {
  timestamp: string;
  sessionId: string;
  actor: string;
  taskId?: string;
  changeSetId?: string;
  reason: string;
  operation: string;
  route: string;
  success: boolean;
  beforeHash?: string;
  afterHash?: string;
  diff?: string;
  stepIndex?: number;
  stepTotal?: number;
  context?: string;
  verification?: "pass" | "fail" | "skip";
}

export interface ChangeSetResult {
  changeSetId: string;
  taskId?: string;
  actor: string;
  reason: string;
  editCount: number;
  entries: ProvenanceEntry[];
  timeRange: { first: string; last: string };
}

// ── Config cache ───────────────────────────────────────────────────────

let _cachedConfig: HashPilotConfig | null = null;

function getConfig(): HashPilotConfig {
  if (!_cachedConfig) _cachedConfig = loadConfig();
  return _cachedConfig;
}

export function clearConfigCache(): void {
  _cachedConfig = null;
}

// ── Factory ────────────────────────────────────────────────────────────

export function createChangeSet(): string {
  return crypto.randomUUID();
}

// ── Field builder ──────────────────────────────────────────────────────

function truncate(val: string, maxLen: number): string {
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}

export function buildProvenanceFields(input: ProvenanceInput): Partial<TelemetryEvent> {
  const fields: Partial<TelemetryEvent> = {};
  const config = getConfig();

  const actor = input.actor ?? config.provenance?.defaultActor;
  if (actor !== undefined)            fields.actor = truncate(actor, 80);
  if (input.taskId !== undefined)     fields.taskId = truncate(input.taskId, 80);
  if (input.changeSetId !== undefined) fields.changeSetId = input.changeSetId;
  if (input.reason !== undefined)     fields.reason = truncate(input.reason, 200);
  if (input.stepIndex !== undefined)  fields.stepIndex = input.stepIndex;
  if (input.stepTotal !== undefined)  fields.stepTotal = input.stepTotal;

  if (input.source !== undefined) {
    fields.beforeHash = computeHash(input.source);
  }

  if (input.source !== undefined && input.newSource !== undefined) {
    fields.afterHash = computeHash(input.newSource);
    if (input.source !== input.newSource) {
      fields.diff = generateUnifiedDiff(
        input.source, input.newSource,
        input.filePath ? input.filePath.replace(/^\//, "") : "unknown", 3
      );
    }
  }

  if (input.context !== undefined) {
    const maxLen = config.provenance?.maxContextLength ?? 500;
    fields.context = input.context.length > maxLen
      ? input.context.slice(0, maxLen) + "..."
      : input.context;
  }

  return fields;
}

// ── Query functions ────────────────────────────────────────────────────

function diffCoversLine(diff: string, targetLine: number): boolean {
  const hunkRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let match: RegExpExecArray | null;
  while ((match = hunkRe.exec(diff)) !== null) {
    const newStart = parseInt(match[3], 10);
    const newCount = match[4] ? parseInt(match[4], 10) : 1;
    if (targetLine >= newStart && targetLine < newStart + newCount) {
      return true;
    }
  }
  return false;
}

function toProvenanceEntry(e: TelemetryEvent): ProvenanceEntry {
  return {
    timestamp: e.timestamp,
    sessionId: e.sessionId,
    actor: e.actor ?? "unknown",
    taskId: e.taskId,
    changeSetId: e.changeSetId,
    reason: e.reason ?? e.operation,
    operation: e.operation,
    route: e.route,
    success: e.success,
    beforeHash: e.beforeHash,
    afterHash: e.afterHash,
    diff: e.diff,
    stepIndex: e.stepIndex,
    stepTotal: e.stepTotal,
    context: e.context,
    // Maps from telemetry's `verification_result` field
    verification: e.verification_result,
  };
}

export function provenanceQuery(file: string, line?: number, fuzzy?: boolean): ProvenanceEntry[] {
  const all = exportEvents();
  const fileEvents = all.filter((e) => e.file === file);

  const filtered = line !== undefined
    ? fileEvents.filter((e) => {
        if (!e.diff) return fuzzy;  // no diff → only include if fuzzy
        return diffCoversLine(e.diff, line);
      })
    : fileEvents;

  return filtered
    .map(toProvenanceEntry)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function changeSetQuery(changeSetId: string): ChangeSetResult | null {
  const all = exportEvents();
  const entries = all
    .filter((e) => e.changeSetId === changeSetId)
    .map(toProvenanceEntry)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (entries.length === 0) return null;

  const first = entries[0];
  const last = entries[entries.length - 1];

  return {
    changeSetId,
    taskId: first.taskId,
    actor: first.actor,
    reason: first.reason,
    editCount: entries.length,
    entries,
    timeRange: { first: first.timestamp, last: last.timestamp },
  };
}

// ── Human-readable formatting ──────────────────────────────────────────

export function formatProvenanceHuman(entries: ProvenanceEntry[]): string {
  if (entries.length === 0) return "No edits found for this file.";

  const lines: string[] = [];
  for (const e of entries) {
    const ts = e.timestamp.slice(0, 19).replace("T", " ");
    const status = e.success ? "OK" : "FAIL";
    const step = e.stepTotal ? ` [${(e.stepIndex ?? 0) + 1}/${e.stepTotal}]` : "";
    const task = e.taskId ? ` task=${e.taskId}` : "";
    const reason = e.reason !== e.operation ? ` "${e.reason}"` : "";
    lines.push(
      `${ts}  ${e.actor}${task}  ${e.operation}  ${e.route}  ${status}${step}${reason}`
    );
  }
  return lines.join("\n");
}
