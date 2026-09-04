// Preload fixture for tests/parser-absent.test.ts (#145 / B56).
//
// Simulates a platform with no usable tree-sitter native binding (e.g.
// linux-arm64, which has no prebuilt binary and whose from-source build can
// fail against modern Node/V8 headers). `mock.module` replaces the module
// registry entry for "tree-sitter" with a factory that throws, so any
// `require("tree-sitter")` in this process — including the lazy one inside
// `getParser()` in src/core/ast-edit.ts — throws exactly the way a genuine
// `ERR_DLOPEN_FAILED` / "No native build was found" error would.
//
// This must be loaded via `bun --preload` (not a plain `import`) so the mock
// is registered before the CLI's module graph is evaluated, and it must live
// under the project tree (not /tmp) so its bare `"tree-sitter"` specifier
// resolves against the *same* node_modules the CLI itself resolves against —
// a preload script in an unrelated directory can resolve to a different
// physical path and the mock silently fails to intercept.
import { mock } from "bun:test";

mock.module("tree-sitter", () => {
  throw new Error(
    "No native build was found for platform=linux arch=arm64 runtime=bun (simulated by tests/fixtures/tree-sitter-absent-preload.ts)",
  );
});
