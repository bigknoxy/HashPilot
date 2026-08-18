import { EditPlan, findSymbolDefinition, findReferences, generatePlan, parseIntent, StructuredIntent } from "./intent";
import { safeWrite } from "./paths";
import { insertParameter, insertCallArg, renameSymbol, detectLanguage } from "./ast-edit";
import { replaceHash } from "./hash-edit";
import { computeHash } from "./read";
import { verifyChanges, recordVerifyBaseline, VerifyResult } from "./verify";
import { recordEvent, ErrorCode } from "./telemetry";
import type { TelemetryEvent } from "./telemetry";
import { createChangeSet, buildProvenanceFields } from "./provenance";

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
  /** Files in the rollback snapshot whose `safeWrite` threw; the tree is half-reverted. */
  unrevertedFiles?: string[];
  /** Set when the plan was refused outright; drives the process exit code. */
  errorCode?: string;
  /** Work the planner could not compute. Non-empty means the plan was partial. */
  unresolved: EditPlan["unresolved"];
}

// ── Plan execution ────────────────────────────────────────────────────

export async function executePlan(
  plan: EditPlan,
  options: {
    dryRun?: boolean;
    verify?: boolean;
    revertOnFailure?: boolean;
    timeout?: number;
    actor?: string;
    taskId?: string;
    reason?: string;
    context?: string;
    /** Proceed even though part of the intent could not be planned. */
    yes?: boolean;
  } = {}
): Promise<PlanResult> {
  const start = Date.now();
  const dryRun = options.dryRun ?? false;
  const doVerify = options.verify ?? true;
  const doRevert = options.revertOnFailure ?? true;
  const timeout = options.timeout ?? 30000;
  const unresolved = plan.unresolved ?? [];

  // A partial plan is refused rather than half-applied: applying only the
  // signature edit and leaving every call site alone breaks the build, and the
  // caller has no way to know it happened unless we stop and say so (#16).
  if (unresolved.length > 0 && !options.yes) {
    return {
      success: false,
      intent: plan.intent,
      plan,
      steps: [],
      summary: { totalSteps: plan.steps.length, succeeded: 0, failed: 0, elapsed_ms: Date.now() - start },
      reverted: false,
      errorCode: "UNSUPPORTED_OPERATION",
      unresolved,
    };
  }

  const planActor = options.actor;
  const planTaskId = options.taskId;
  const planContext = options.context;
  const planReason = options.reason ?? `${plan.intent.operation} on '${plan.intent.symbol}'`;
  const changeSetId = createChangeSet();
  const stepTotal = plan.steps.length;

  // Snapshot all impacted files for rollback.
  //
  // A file we cannot read here has no snapshot, so it can never be rolled back.
  // Swallowing that read failure re-creates the exact defect #17 closed on the
  // write side: the revert loop iterates `originals`, so an unsnapshotted file
  // is neither restored nor reported, and `reverted: true` goes out over a tree
  // that still holds the edit. Record the miss now and fold it into
  // `unrevertedFiles` if a rollback actually fires.
  const originals = new Map<string, string>();
  const unsnapshotted: string[] = [];
  if (doRevert) {
    for (const file of [...new Set(plan.steps.map((s) => s.file))]) {
      try {
        originals.set(file, await Bun.file(file).text());
      } catch {
        unsnapshotted.push(file);
      }
    }
  }

  // Record which tests already fail, while the tree is still pristine. This is
  // the only moment a baseline can be taken honestly — after the first step the
  // failures are no longer "pre-existing". Cached per commit SHA, so this is a
  // no-op on every plan after the first at a given commit. Best-effort: a repo
  // with no runner, no git, or a timing-out suite simply gets no baseline, and
  // verification then counts every failure as it did before (#24).
  if (doVerify && !dryRun) {
    try {
      await recordVerifyBaseline([...new Set(plan.steps.map((s) => s.file))], {
        autoDetect: true,
        timeout,
      });
    } catch {}
  }

  const results: StepResult[] = [];

  // Execute steps in order (sequential is safer for dependent edits)
  for (const step of plan.steps) {
    const stepStart = Date.now();
    let stepSuccess = false;
    let stepMessage = "";
    let stepNewSource: string | undefined;
    let stepSource: string | undefined;

    try {
      stepSource = await Bun.file(step.file).text();
      const source = stepSource;
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

      stepSuccess = result.success;
      stepMessage = result.message;
      stepNewSource = result.newSource;

      if (stepSuccess && stepNewSource && !dryRun) {
        await safeWrite(step.file, stepNewSource);
      }
    } catch (err: any) {
      stepSuccess = false;
      stepMessage = `Error: ${err.message}`;
    }

    results.push({
      step: step.order,
      file: step.file,
      operation: step.operation,
      success: stepSuccess,
      message: stepMessage,
      elapsed_ms: Date.now() - stepStart,
    });

    const stepProvenance = buildProvenanceFields({
      actor: planActor,
      taskId: planTaskId,
      changeSetId,
      reason: step.description,
      source: stepSource,
      newSource: stepNewSource,
      stepIndex: step.order,
      stepTotal,
      context: planContext,
      filePath: step.file,
    });

    let stepRoute: TelemetryEvent["route"] = "ast";
    if (step.operation === "diff") stepRoute = "diff";
    else if (step.operation === "replace-hash") stepRoute = "hash";

    recordEvent({
      operation: step.operation,
      route: stepRoute,
      file: step.file,
      language: detectLanguage(step.file) || undefined,
      success: stepSuccess,
      elapsed_ms: Date.now() - stepStart,
      ...stepProvenance,
    });
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  const stepFailed = failed > 0;

  // Run verification after all steps have applied, so the verify run sees the
  // full in-memory state.
  //
  // Skipped when a step already failed. The tree is then half-applied, so the
  // suite is being run over a state no one asked for and is about to be
  // reverted — it costs a full test run to produce a failure that is a
  // consequence of the step failure, not an independent finding. Worse, it used
  // to overwrite the diagnosis: `errorCode` became VERIFY_FAILED (exit 4,
  // "the edit applied but tests failed") when the edit had in fact never
  // applied (exit 2).
  let verification: VerifyResult | undefined;
  if (doVerify && !dryRun && !stepFailed) {
    const impactedFiles = [...new Set(plan.steps.map((s) => s.file))];
    verification = await verifyChanges(impactedFiles, {
      autoDetect: true,
      revertOnFailure: false, // executePlan owns the rollback path
      useBaseline: true, // only tests this plan actually broke count (#24)
      timeout,
    });
  }

  const verifyFailed = verification?.overall === "fail";
  // A timeout is not a failure and must not trigger a rollback: the suite never
  // reached a verdict, so reverting would destroy work on no evidence (#24).
  // It is still not a pass — the plan reports `success: false` with
  // VERIFY_TIMEOUT so the caller decides what to do.
  const verifyTimedOut = verification?.overall === "timeout";
  const allPassed = !stepFailed && !verifyFailed && !verifyTimedOut;

  // Rollback on step failure OR verification failure.
  //
  // #10: verification was computed but its result was never read.  The old loop
  //      condition `!allPassed` only tracked step failures, so a green step /
  //      red test suite reported `success: true` and kept the broken changes.
  //
  // #17: `catch {}` in the revert loop meant a half-reverted tree still set
  //       `reverted: true`.  `unrevertedFiles` now names every snapshot file
  //      that could not be restored; `reverted` is only `true` when every file
  //      in the snapshot was written back.
  const unrevertedFiles: string[] = [];
  let reverted = false;
  if ((stepFailed || verifyFailed) && doRevert && !dryRun && originals.size > 0) {
    for (const [file, original] of originals) {
      try { await safeWrite(file, original); }
      catch { unrevertedFiles.push(file); }
    }
    // A file that was edited but never snapshotted is just as unreverted as one
    // whose restore write threw — there was nothing to write back. Only count
    // it if a step actually changed it; an unreadable file that also failed its
    // step left the tree untouched and needs no rollback.
    const editedFiles = new Set(results.filter((r) => r.success).map((r) => r.file));
    for (const file of unsnapshotted) {
      if (editedFiles.has(file)) unrevertedFiles.push(file);
    }
    reverted = unrevertedFiles.length === 0;
  }

  const elapsed = Date.now() - start;

  // Error-code precedence, most alarming first.
  //
  // An incomplete rollback outranks everything else: the tree is now in a state
  // neither the caller nor the plan asked for. Reporting that as VERIFY_FAILED
  // (exit 4) tells an agent "your edit applied, the tests didn't pass" — which
  // reads as safe to retry, when in fact some files still hold edits that were
  // supposed to be undone. ROLLBACK_INCOMPLETE maps to exit 5 (I/O), so it does
  // not sit in the retryable band at all.
  //
  // VERIFY_FAILED has its own slot (code 4). A bare step failure carries no
  // errorCode and the exit-code system maps `success: false` to code 2.
  const errorCode: string | undefined =
    unrevertedFiles.length > 0
      ? ErrorCode.ROLLBACK_INCOMPLETE
      : verifyTimedOut
        ? ErrorCode.VERIFY_TIMEOUT
        : verifyFailed
          ? ErrorCode.VERIFY_FAILED
          : undefined;

  recordEvent({
    operation: `intent-${plan.intent.operation}`,
    route: "intent",
    success: allPassed,
    elapsed_ms: elapsed,
    files_count: plan.steps.length,
    changeSetId,
    actor: planActor,
    taskId: planTaskId,
    reason: planReason,
    context: planContext,
    stepTotal: plan.steps.length,
    errorCode,
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
    unrevertedFiles: unrevertedFiles.length > 0 ? unrevertedFiles : undefined,
    errorCode,
    unresolved,
  };
}

// ── Top-level API: intent → plan → execute ────────────────────────────

export interface IntentResult {
  success: boolean;
  plan: EditPlan;
  execution: PlanResult;
  /** Mirrors `execution.errorCode` so the CLI's exit-code mapping sees it. */
  errorCode?: string;
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
    actor?: string;
    taskId?: string;
    reason?: string;
    context?: string;
    yes?: boolean;
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

  return { success: execution.success, plan, execution, errorCode: execution.errorCode };
}
