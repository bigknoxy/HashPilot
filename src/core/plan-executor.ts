import { EditPlan, EditStep, findSymbolDefinition, findReferences, generatePlan, parseIntent, StructuredIntent } from "./intent";
import { insertParameter, insertCallArg, renameSymbol, detectLanguage } from "./ast-edit";
import { replaceHash } from "./hash-edit";
import { computeHash } from "./read";
import { verifyChanges, VerifyResult } from "./verify";
import { recordEvent } from "./telemetry";

// ── Result types ──────────────────────────────────────────────────────

export interface StepResult {
  step: number;
  file: string;
  operation: string;
  success: boolean;
  message: string;
  elapsed_ms: number;
}

export interface PlanResult {
  success: boolean;
  intent: StructuredIntent;
  plan: EditPlan;
  steps: StepResult[];
  summary: {
    totalSteps: number;
    succeeded: number;
    failed: number;
    elapsed_ms: number;
  };
  verification?: VerifyResult;
  reverted: boolean;
}

// ── Plan execution ────────────────────────────────────────────────────

export async function executePlan(
  plan: EditPlan,
  options: {
    dryRun?: boolean;
    verify?: boolean;
    revertOnFailure?: boolean;
    timeout?: number;
  } = {}
): Promise<PlanResult> {
  const start = Date.now();
  const dryRun = options.dryRun ?? false;
  const doVerify = options.verify ?? true;
  const doRevert = options.revertOnFailure ?? true;
  const timeout = options.timeout ?? 30000;

  // Snapshot all impacted files for rollback
  const originals = new Map<string, string>();
  if (doRevert) {
    for (const file of [...new Set(plan.steps.map((s) => s.file))]) {
      try { originals.set(file, await Bun.file(file).text()); } catch {}
    }
  }

  const results: StepResult[] = [];

  // Execute steps in order (sequential is safer for dependent edits)
  for (const step of plan.steps) {
    const stepStart = Date.now();
    try {
      const source = await Bun.file(step.file).text();
      let result: { success: boolean; message: string; newSource?: string };

      switch (step.operation) {
        case "insert-parameter":
          result = insertParameter(source, step.file, step.params.symbolName, step.params.newParam);
          break;

        case "insert-call-arg":
          result = insertCallArg(source, step.file, step.params.functionName, step.params.argValue);
          break;

        case "rename-symbol":
          result = renameSymbol(source, step.file, step.params.oldName, step.params.newName);
          break;

        case "replace-hash": {
          const srcHash = computeHash(source);
          const hashResult = await replaceHash(step.file, srcHash, step.params.newContent!, { dryRun });
          result = hashResult;
          break;
        }

        case "diff": {
          const { oldContent, newContent } = step.params;
          if (!oldContent || !newContent) {
            result = { success: false, message: "Diff requires oldContent and newContent" };
            break;
          }
          const count = source.split(oldContent).length - 1;
          if (count === 0) {
            result = { success: false, message: `Content not found in ${step.file}` };
          } else if (count > 1) {
            result = { success: false, message: `Content appears ${count} times — disambiguate` };
          } else {
            const newSource = source.split(oldContent).join(newContent);
            result = { success: true, message: `Replaced content`, newSource };
          }
          break;
        }

        default:
          result = { success: false, message: `Unknown operation: ${step.operation}` };
      }

      // Write result
      if (result.success && result.newSource && !dryRun) {
        await Bun.write(step.file, result.newSource);
      }

      results.push({
        step: step.order,
        file: step.file,
        operation: step.operation,
        success: result.success,
        message: result.message,
        elapsed_ms: Date.now() - stepStart,
      });
    } catch (err: any) {
      results.push({
        step: step.order,
        file: step.file,
        operation: step.operation,
        success: false,
        message: `Error: ${err.message}`,
        elapsed_ms: Date.now() - stepStart,
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  const allPassed = failed === 0;

  // Run verification
  let verification: VerifyResult | undefined;
  if (doVerify && !dryRun) {
    const impactedFiles = [...new Set(plan.steps.map((s) => s.file))];
    verification = await verifyChanges(impactedFiles, {
      autoDetect: true,
      revertOnFailure: false, // We handle rollback ourselves
      timeout,
    });
  }

  // Rollback on failure
  let reverted = false;
  if (!allPassed && doRevert && !dryRun && originals.size > 0) {
    for (const [file, original] of originals) {
      try { await Bun.write(file, original); } catch {}
    }
    reverted = true;
  }

  const elapsed = Date.now() - start;

  recordEvent({
    operation: `intent-${plan.intent.operation}`,
    route: "intent",
    success: allPassed,
    elapsed_ms: elapsed,
    files_count: plan.steps.length,
  });

  return {
    success: allPassed,
    intent: plan.intent,
    plan,
    steps: results,
    summary: {
      totalSteps: plan.steps.length,
      succeeded,
      failed,
      elapsed_ms: elapsed,
    },
    verification,
    reverted,
  };
}

// ── Top-level API: intent → plan → execute ────────────────────────────

export interface IntentResult {
  success: boolean;
  plan: EditPlan;
  execution: PlanResult;
}

/**
 * The one-shot entry point for intent-based editing.
 * Parses the intent, discovers references, generates a plan, and executes it.
 */
export async function executeIntent(
  rawIntent: string,
  options: {
    projectRoot?: string;
    dryRun?: boolean;
    verify?: boolean;
    revertOnFailure?: boolean;
    timeout?: number;
  } = {}
): Promise<IntentResult> {
  const intent = parseIntent(rawIntent);

  // Auto-discover project root from hint file or cwd
  const projectRoot = options.projectRoot || ".";
  const definition = await findSymbolDefinition(intent.symbol, projectRoot, intent.file);
  if (!definition) {
    throw new Error(`Symbol '${intent.symbol}' not found in project at ${projectRoot}`);
  }

  const references = await findReferences(intent.symbol, projectRoot, definition.file);
  const plan = generatePlan(intent, definition, references);
  const execution = await executePlan(plan, options);

  return { success: execution.success, plan, execution };
}
