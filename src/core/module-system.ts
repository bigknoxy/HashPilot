/**
 * JavaScript module-system detection (#139).
 *
 * `add-import` used to emit ESM `import` syntax into every JavaScript file,
 * report `success: true`, and leave a CommonJS file that Node refuses to load.
 * The parse-validity gate cannot catch it: tree-sitter's JavaScript grammar
 * accepts `import` and `require` in the same file, so the result parses. Node
 * does not.
 *
 * This module answers "which module system does this file use?" from the file
 * path plus its content, so the caller can emit the right syntax or refuse.
 * It is deliberately free of tree-sitter: the signals are the extension, the
 * nearest `package.json`, and a content sniff, none of which need a parse.
 */
import { readFileSync } from "node:fs";
import { dirname, join, parse as parsePath } from "node:path";

export type ModuleSystem = "esm" | "cjs";

/** How the verdict was reached — carried into error messages so a refusal explains itself. */
export type ModuleSystemSignal = "extension" | "package.json" | "content" | "default";

export interface ModuleSystemVerdict {
  /** `null` when the signals contradict each other and no default is safe. */
  system: ModuleSystem | null;
  signal: ModuleSystemSignal;
  /** Human-readable reason, suitable for an error message. */
  detail: string;
}

/**
 * Walk up from `startDir` looking for the nearest `package.json`, and report its
 * `type` field. Returns `null` when no `package.json` exists anywhere above the
 * file — a bare script outside any package, where the field cannot speak.
 *
 * A `package.json` that exists but declares no `type` is not silence: the field
 * defaults to `"commonjs"` per Node's own resolution rules, so that is a real
 * CJS signal.
 */
export function nearestPackageType(startDir: string): { system: ModuleSystem; path: string } | null {
  const { root } = parsePath(startDir);
  let dir = startDir;
  // Bounded by the filesystem root; `dirname("/") === "/"` terminates the walk.
  for (;;) {
    const candidate = join(dir, "package.json");
    let raw: string;
    try {
      raw = readFileSync(candidate, "utf8");
    } catch {
      if (dir === root) return null;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
      continue;
    }
    let type: unknown;
    try {
      type = (JSON.parse(raw) as { type?: unknown }).type;
    } catch {
      // A malformed package.json is not a signal. Keep walking rather than
      // guessing from a file we could not read.
      if (dir === root) return null;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
      continue;
    }
    return { system: type === "module" ? "esm" : "cjs", path: candidate };
  }
}

/** True when the source contains a CommonJS marker outside of an obvious comment. */
function hasCjsMarkers(source: string): boolean {
  return /(^|[^.\w$])require\s*\(/.test(source) || /\bmodule\.exports\b/.test(source) || /\bexports\.\w/.test(source);
}

/** True when the source contains an ESM marker at the start of some line. */
function hasEsmMarkers(source: string): boolean {
  return /^\s*import\s+[^(]/m.test(source) || /^\s*import\s*[{*]/m.test(source) || /^\s*export\s/m.test(source);
}

/**
 * Decide a JavaScript file's module system. Signals, cheapest first — first
 * match wins:
 *
 * 1. Extension: `.cjs` is always CommonJS, `.mjs` always ESM. Node ignores
 *    `package.json` for both, so nothing below can overrule them.
 * 2. Nearest `package.json` `type` field (absent field ⇒ CommonJS).
 * 3. Content: `require(` / `module.exports` / `exports.x` ⇒ CJS, a top-level
 *    `import`/`export` ⇒ ESM. **Both** ⇒ no verdict; the caller must refuse
 *    rather than pick.
 *
 * With no signal at all — a bare script outside any package, holding neither
 * marker — the verdict is ESM. That is the historical behavior and the modern
 * default; it is reported as `signal: "default"` so a caller can tell a guess
 * from a finding.
 *
 * Only meaningful for JavaScript. TypeScript compiles to whichever system its
 * own config selects, so callers must not consult this for `.ts`/`.tsx`.
 */
export function detectModuleSystem(filePath: string, source: string): ModuleSystemVerdict {
  if (filePath.endsWith(".cjs")) {
    return { system: "cjs", signal: "extension", detail: "the .cjs extension is always CommonJS" };
  }
  if (filePath.endsWith(".mjs")) {
    return { system: "esm", signal: "extension", detail: "the .mjs extension is always ESM" };
  }

  const pkg = nearestPackageType(dirname(filePath));
  if (pkg) {
    return {
      system: pkg.system,
      signal: "package.json",
      detail:
        pkg.system === "esm"
          ? `${pkg.path} declares "type": "module"`
          : `${pkg.path} does not declare "type": "module", so Node treats this file as CommonJS`,
    };
  }

  const cjs = hasCjsMarkers(source);
  const esm = hasEsmMarkers(source);
  if (cjs && esm) {
    return {
      system: null,
      signal: "content",
      detail:
        "the file mixes CommonJS (require/module.exports) and ESM (import/export) syntax, " +
        "and no extension or package.json settles which one Node will use",
    };
  }
  if (cjs) return { system: "cjs", signal: "content", detail: "the file already uses require/module.exports" };
  if (esm) return { system: "esm", signal: "content", detail: "the file already uses import/export" };

  return { system: "esm", signal: "default", detail: "no extension, package.json, or in-file signal; defaulting to ESM" };
}
