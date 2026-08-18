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
  parseSource,
  firstParseError,
  setAllowParseErrors,
  getAllowParseErrors,
} from "./ast-edit";
export type { ParseIssue } from "./ast-edit";
export type { ASTEditResult, SymbolInfo, LanguageCapability } from "./ast-edit";
export { verifyChanges, recordVerifyBaseline } from "./verify";
export type { VerifyResult, VerifyOptions, ToolRun, RecordBaselineResult } from "./verify";
export { buildTestInvocation, parseFailures } from "./verify-scope";
export type { TestInvocation } from "./verify-scope";
export { compareToBaseline, currentCommit, readBaseline, writeBaseline, scopeSignature } from "./verify-baseline";
export type { Baseline, BaselineReport, BaselineSource } from "./verify-baseline";
export {
  recordEvent,
  readEvents,
  lastReadSkipped,
  TelemetryReadError,
  clearEvents,
  summary,
  health,
  healthTrend,
  ErrorCode,
  listSessions,
  exportEvents,
  pruneEvents,
  configureTelemetry,
  enableTelemetry,
  resolveTelemetryEnabled,
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
export type { BatchParams, BatchResult, BatchSummary, BatchEditOptions } from "./batch-edit";
export {
  acquireLock,
  acquireSortedLocks,
  LOCK_TIMEOUT_MS,
  lockPathFor,
  LockAcquireError,
  pruneStaleLocks,
} from "./locking";
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
  UnresolvedItem,
} from "./intent";
export { executeIntent, executePlan } from "./plan-executor";
export type { StepResult, PlanResult, IntentResult } from "./plan-executor";
export { loadConfig, policyForce } from "./config";
export type { HashPilotConfig, RoutePolicy, TelemetryConfig, ProvenanceConfig, SnapshotConfig } from "./config";
export {
  recordSnapshot,
  listChangeSets,
  lastChangeSetId,
  undoChangeSet,
  pruneSnapshots,
  cleanOrphanTempFiles,
  configureSnapshots,
  resetSnapshots,
  setCurrentChangeSet,
  getCurrentChangeSet,
  snapshotRoot,
  DEFAULT_RETENTION,
} from "./snapshot";
export type { SnapshotRecord, ChangeSetSummary, UndoResult, UndoFileResult, SnapshotRetention } from "./snapshot";
export { createChangeSet, buildProvenanceFields, provenanceQuery, changeSetQuery, formatProvenanceHuman } from "./provenance";
export type { ProvenanceInput, ProvenanceEntry, ChangeSetResult } from "./provenance";
export { doctor } from "./doctor";
export type { DoctorReport, DoctorCheck } from "./doctor";
export { escapeRegex } from "./utils";
export {
  assertWritable,
  assertAllWritable,
  safeWrite,
  atomicWrite,
  simulateCrashAfterTempWrite,
  findProjectRoot,
  configureWriteBoundary,
  resetWriteBoundary,
  PathDeniedError,
} from "./paths";
export type { AssertWritableOptions } from "./paths";
export { ExitCode, exitCodeFor, finish, usageError } from "./exit-codes";
export { wrap, wrapResult, addWarning, takeWarnings, setCommand, currentCommandName, API_VERSION } from "./envelope";
export type { Envelope, EnvelopeError, EnvelopeWarning } from "./envelope";
export type { ResultLike } from "./exit-codes";
export type { RecoveryMode } from "./hash-edit";
export { UnsupportedIntentError } from "./intent";
export { redactSecrets, redactEvent, isSensitiveFile } from "./redact";
export { normalizePath, pathsEqual } from "./path-normalize";
