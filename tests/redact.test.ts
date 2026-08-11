import { describe, test, expect } from "bun:test";
import { redactSecrets, redactEvent, isSensitiveFile } from "../src/core/redact";

describe("redactSecrets", () => {
  const cases: Array<[string, string]> = [
    ["aws access key id", "AKIAIOSFODNN7EXAMPLE"],
    ["openai key", "sk-abcdefghijklmnopqrstuvwx"],
    ["anthropic key", "sk-ant-api03-abcdefghijklmnopqrstuvwx"],
    ["github pat", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["slack token", "xoxb-123456789012-abcdefghij"],
    ["google api key", "AIzaSyA1234567890abcdefghijklmnopqrstuv"],
  ];

  for (const [name, secret] of cases) {
    test(`redacts ${name}`, () => {
      const out = redactSecrets(`value = ${secret}`);
      expect(out).not.toContain(secret);
      expect(out).toContain("[REDACTED]");
    });
  }

  test("redacts a private key block", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nsecretbytes\n-----END RSA PRIVATE KEY-----";
    const out = redactSecrets(pem);
    expect(out).not.toContain("secretbytes");
  });

  test("redacts a bearer authorization header", () => {
    const out = redactSecrets('Authorization: Bearer abc123def456');
    expect(out).not.toContain("abc123def456");
  });

  test("redacts the password in a connection string", () => {
    const out = redactSecrets("postgres://user:hunter2pass@db.example.com:5432/app");
    expect(out).not.toContain("hunter2pass");
    expect(out).toContain("db.example.com");
  });

  test("redacts secret-named assignments regardless of value shape", () => {
    for (const line of [
      'const apiKey = "zzzzzzzzzzzz"',
      "DB_PASSWORD=correcthorse",
      'client_secret: "abcdefghijkl"',
      "ACCESS_TOKEN = qwertyuiopas",
    ]) {
      expect(redactSecrets(line)).toContain("[REDACTED]");
    }
  });

  test("leaves ordinary source untouched", () => {
    const src = "function add(a: number, b: number) { return a + b; }";
    expect(redactSecrets(src)).toBe(src);
  });
});

describe("isSensitiveFile", () => {
  const sensitive = [".env", ".env.local", "server.pem", "tls.key", "id_rsa", "id_ed25519.pub",
    "credentials", ".npmrc", ".netrc", "cert.p12", "secrets.yaml"];
  const ordinary = ["index.ts", "keyboard.ts", "environment.md", "README.md", "credentials.test.ts"];

  for (const f of sensitive) {
    test(`${f} is sensitive`, () => expect(isSensitiveFile(`/repo/${f}`)).toBe(true));
  }
  for (const f of ordinary) {
    test(`${f} is not sensitive`, () => expect(isSensitiveFile(`/repo/${f}`)).toBe(false));
  }
});

describe("redactEvent", () => {
  test("walks nested strings and arrays without changing structure", () => {
    const out = redactEvent({
      operation: "replace-hash",
      success: true,
      retries: 1,
      diff: "+ const token = ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      failed_in: ["lint: AKIAIOSFODNN7EXAMPLE"],
      nested: { reason: "rotate sk-abcdefghijklmnopqrstuvwx" },
    });
    expect(out.success).toBe(true);
    expect(out.retries).toBe(1);
    expect(JSON.stringify(out)).not.toContain("ghp_");
    expect(JSON.stringify(out)).not.toContain("AKIA");
    expect(out.nested.reason).toContain("[REDACTED]");
  });
});
