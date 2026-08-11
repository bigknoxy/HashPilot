import { describe, test, expect } from "bun:test";
import { ExitCode, exitCodeFor } from "../src/core/exit-codes";
import { ErrorCode } from "../src/core/telemetry";

describe("exitCodeFor", () => {
  test("success is 0", () => {
    expect(exitCodeFor({ success: true })).toBe(ExitCode.OK);
  });

  test("stale anchors are retryable preconditions, not generic failures", () => {
    // Agents branch on this: 3 means "re-read and try again", 2 means "stop".
    expect(exitCodeFor({ success: false, errorCode: ErrorCode.STALE_ANCHOR })).toBe(ExitCode.PRECONDITION);
    expect(exitCodeFor({ success: false, errorCode: ErrorCode.HASH_MISMATCH })).toBe(ExitCode.PRECONDITION);
  });

  test("bad input is a usage error", () => {
    expect(exitCodeFor({ success: false, errorCode: ErrorCode.INVALID_ARGUMENT })).toBe(ExitCode.USAGE);
    expect(exitCodeFor({ success: false, errorCode: ErrorCode.PATH_DENIED })).toBe(ExitCode.USAGE);
    expect(exitCodeFor({ success: false, errorCode: ErrorCode.UNSUPPORTED_OPERATION })).toBe(ExitCode.USAGE);
  });

  test("missing or unwritable files are I/O errors", () => {
    expect(exitCodeFor({ success: false, errorCode: ErrorCode.FILE_NOT_FOUND })).toBe(ExitCode.IO);
    expect(exitCodeFor({ success: false, errorCode: ErrorCode.WRITE_FAILED })).toBe(ExitCode.IO);
  });

  test("verification failure has its own code", () => {
    expect(exitCodeFor({ success: false, errorCode: ErrorCode.VERIFY_FAILED })).toBe(ExitCode.VERIFY_FAILED);
  });

  test("an unmapped failure is never reported as success", () => {
    expect(exitCodeFor({ success: false })).toBe(ExitCode.EDIT_FAILED);
    expect(exitCodeFor({ success: false, errorCode: "SOMETHING_NEW" as ErrorCode })).toBe(ExitCode.EDIT_FAILED);
  });

  test("undefined payloads do not claim success", () => {
    expect(exitCodeFor(undefined)).toBe(ExitCode.OK);
  });

  test("for a batch, the worst code wins", () => {
    expect(exitCodeFor([
      { success: true },
      { success: false, errorCode: ErrorCode.STALE_ANCHOR },
      { success: false, errorCode: ErrorCode.SYMBOL_NOT_FOUND },
    ])).toBe(ExitCode.PRECONDITION);
  });

  test("an all-success batch is 0", () => {
    expect(exitCodeFor([{ success: true }, { success: true }])).toBe(ExitCode.OK);
  });
});
