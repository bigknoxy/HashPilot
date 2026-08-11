import { basename } from "node:path";

/**
 * Secret redaction for anything that reaches the telemetry log.
 *
 * Telemetry is written to `~/.agentic-tools/logs/` in plaintext and may be
 * exported or shared. Provenance diffs put real source lines in there, so a
 * `.env` edit or a pasted key would be persisted verbatim. Redaction runs on
 * every string field before the event is serialized.
 */

const REDACTED = "[REDACTED]";

interface Rule {
  name: string;
  pattern: RegExp;
  /** Replacement; `$1` etc. refer to capture groups kept as context. */
  replacement: string;
}

const RULES: Rule[] = [
  { name: "aws-access-key-id", pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/g, replacement: REDACTED },
  { name: "aws-secret-access-key", pattern: /\b(aws_secret_access_key\s*[:=]\s*)\S+/gi, replacement: `$1${REDACTED}` },
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: REDACTED },
  { name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, replacement: REDACTED },
  { name: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g, replacement: REDACTED },
  { name: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, replacement: REDACTED },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, replacement: REDACTED },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replacement: REDACTED },
  { name: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: `-----BEGIN PRIVATE KEY-----${REDACTED}-----END PRIVATE KEY-----` },
  { name: "authorization-header", pattern: /\b(authorization\s*[:=]\s*["']?)(?:bearer|basic|token)\s+\S+/gi, replacement: `$1${REDACTED}` },
  { name: "connection-string-password", pattern: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+(@)/gi, replacement: `$1${REDACTED}$2` },
  // Assignments whose *name* implies a secret. Deliberately last: the value is
  // replaced wholesale rather than pattern-matched, so it catches formats the
  // rules above do not know about.
  {
    name: "secretish-assignment",
    pattern: /\b([A-Za-z0-9_.-]*(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|credential)[A-Za-z0-9_.-]*\s*[:=]\s*)(["']?)([^\s"',;)}]{6,})\2/gi,
    replacement: `$1$2${REDACTED}$2`,
  },
];

/** Redact every known secret shape in a string. Returns the input unchanged when nothing matches. */
export function redactSecrets(input: string): string {
  let out = input;
  for (const rule of RULES) out = out.replace(rule.pattern, rule.replacement);
  return out;
}

/**
 * Files whose *contents* are secret by definition. Their diffs and source are
 * never recorded, regardless of what redaction would catch.
 */
const SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^credentials$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^.*\.keystore$/i,
  /^secrets?\.(ya?ml|json|toml)$/i,
];

/** True when the file's contents must never appear in telemetry. */
export function isSensitiveFile(filePath: string): boolean {
  const name = basename(filePath);
  return SENSITIVE_FILE_PATTERNS.some((re) => re.test(name));
}

/**
 * Recursively redact the string fields of a telemetry event. Object keys and
 * non-string values pass through untouched — only values can carry secrets.
 */
export function redactEvent<T>(event: T): T {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return redactSecrets(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return walk(event) as T;
}
