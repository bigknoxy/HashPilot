import { describe, test, expect } from "bun:test";
import { redactSecrets } from "../src/core/redact";

describe("bare token format redaction", () => {
  test("redacts bare npm_ token pattern", () => {
    const result = redactSecrets("The token is npm_pABCDEFGHIJKLMN1234567 and we need it");
    expect(result).not.toContain("npm_pABCDEFGHIJKLMN1234567");
    expect(result).toContain("[REDACTED]");
  });

  test("redacts bare sk_live_ token pattern", () => {
    const result = redactSecrets("The key is sk_live_abc123xyz used for payments");
    expect(result).not.toContain("sk_live_abc123xyz");
    expect(result).toContain("[REDACTED]");
  });

  test("redacts bare pk_live_ token pattern", () => {
    const result = redactSecrets("The secret is pk_live_abc123xyz for refunds");
    expect(result).not.toContain("pk_live_abc123xyz");
    expect(result).toContain("[REDACTED]");
  });

  test("existing assignment patterns still work", () => {
    const result = redactSecrets('const apiKey = "zzzzzzzzzzzz"');
    expect(result).toContain("[REDACTED]");
  });

  test("normal strings remain unchanged", () => {
    const result = redactSecrets("just a normal string with no secrets");
    expect(result).toBe("just a normal string with no secrets");
  });
});
