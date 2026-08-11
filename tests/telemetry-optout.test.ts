import { describe, test, expect, afterEach } from "bun:test";
import { resolveTelemetryEnabled } from "../src/core/telemetry";

const ENV = "HASHPILOT_TELEMETRY";

afterEach(() => {
  delete process.env[ENV];
});

describe("resolveTelemetryEnabled", () => {
  test("telemetry is on when nothing opts out", () => {
    expect(resolveTelemetryEnabled(undefined, false)).toBe(true);
  });

  test("config can turn it off", () => {
    expect(resolveTelemetryEnabled({ enabled: false }, false)).toBe(false);
  });

  test("the env var overrides a config that enables it", () => {
    for (const v of ["0", "false", "off", "no", " OFF "]) {
      process.env[ENV] = v;
      expect(resolveTelemetryEnabled({ enabled: true }, false)).toBe(false);
    }
  });

  test("an unrecognized env value does not disable telemetry", () => {
    process.env[ENV] = "1";
    expect(resolveTelemetryEnabled(undefined, false)).toBe(true);
  });

  test("--no-telemetry wins over everything", () => {
    process.env[ENV] = "1";
    expect(resolveTelemetryEnabled({ enabled: true }, true)).toBe(false);
  });
});
