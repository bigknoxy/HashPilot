export { readMany, readHash, computeHash, computeLineHash } from "./read";
export type { ReadResult, ReadHashResult } from "./read";
export { grepMany, symbolLookupMany } from "./grep";
export type { GrepResult, GrepManyResult, SymbolLookupResult } from "./grep";
export { replaceHash } from "./hash-edit";
export type { ReplaceHashResult, ReplaceHashOptions } from "./hash-edit";
export {
  findSymbols,
  renameSymbol,
  replaceBody,
  addImport,
  removeImport,
  insertBeforeSymbol,
  insertAfterSymbol,
  insertParameter,
  insertCallArg,
  detectLanguage,
  isLanguageSupported,
  supportedLanguages,
  astCapabilities,
} from "./ast-edit";
export type { ASTEditResult, SymbolInfo, LanguageCapability } from "./ast-edit";
export { verifyChanges } from "./verify";
export type { VerifyResult, VerifyOptions } from "./verify";
export {
  recordEvent,
  readEvents,
  clearEvents,
  summary,
  health,
  healthTrend,
  ErrorCode,
  listSessions,
  exportEvents,
  pruneEvents,
  configureTelemetry,
  getSessionId,
  MAX_FILE_SIZE,
  MAX_ROTATED_FILES,
  RETENTION_DAYS,
} from "./telemetry";
export type { TelemetryEvent, HealthReport, HealthTrend, SessionSummary } from "./telemetry";
export { generateUnifiedDiff, parsePatch, applyPatchToSource, applyPatch } from "./diff-engine";
export type { Hunk, PatchResult } from "./diff-engine";
export { chooseRoute, routeEdit } from "./router";
export type { EditRoute, RouterResult, RouteExplanation } from "./router";
export { editMany, editManySerial } from "./batch-edit";
export type { BatchParams, BatchResult, BatchSummary } from "./batch-edit";
export { parseIntent, findSymbolDefinition, findReferences, generatePlan } from "./intent";
export type {
  IntentOperation,
  StructuredIntent,
  AddParameterIntent,
  RemoveParameterIntent,
  RenameExportedSymbolIntent,
  ReferenceLocation,
  SymbolDefinition,
  EditStep,
  EditPlan,
} from "./intent";
export { executeIntent, executePlan } from "./plan-executor";
export type { StepResult, PlanResult, IntentResult } from "./plan-executor";
export { loadConfig, policyForce } from "./config";
export type { HashPilotConfig, RoutePolicy, TelemetryConfig, ProvenanceConfig } from "./config";
export { createChangeSet, buildProvenanceFields, provenanceQuery, changeSetQuery, formatProvenanceHuman } from "./provenance";
export type { ProvenanceInput, ProvenanceEntry, ChangeSetResult } from "./provenance";
export { doctor } from "./doctor";
export type { DoctorReport, DoctorCheck } from "./doctor";
export { escapeRegex } from "./utils";