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
  detectLanguage,
  isLanguageSupported,
  supportedLanguages,
  astCapabilities,
} from "./ast-edit";
export type { ASTEditResult, SymbolInfo, LanguageCapability } from "./ast-edit";
export { verifyChanges } from "./verify";
export type { VerifyResult, VerifyOptions } from "./verify";
export { recordEvent, readEvents, clearEvents, summary, health, healthTrend } from "./telemetry";
export type { TelemetryEvent, HealthReport, HealthTrend } from "./telemetry";
export { chooseRoute, routeEdit } from "./router";
export type { EditRoute, RouterResult, RouteExplanation } from "./router";
export { loadConfig, policyForce } from "./config";
export type { HashPilotConfig, RoutePolicy, TelemetryConfig } from "./config";
export { doctor } from "./doctor";
export type { DoctorReport, DoctorCheck } from "./doctor";