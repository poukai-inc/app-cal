import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateVideoToken, verifyVideoToken } from "./videoTokens";

const SECRET = "test-secret-value";

describe("videoTokens", () => {
  beforeEach(() => {
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a freshly generated token round-trip", () => {
    const token = generateVideoToken("recording_123");
    expect(verifyVideoToken(token)).toEqual({ valid: true, recordingId: "recording_123" });
  });

  it("rejects a token with a tampered HMAC", () => {
    const token = generateVideoToken("recording_123");
    const [recordingId, expires] = token.split(":");
    const forged = `${recordingId}:${expires}:${"0".repeat(64)}`;
    expect(verifyVideoToken(forged)).toEqual({ valid: false });
  });

  it("rejects a token whose recordingId was swapped (HMAC no longer matches)", () => {
    const token = generateVideoToken("recording_123");
    const [, expires, hmac] = token.split(":");
    expect(verifyVideoToken(`recording_999:${expires}:${hmac}`)).toEqual({ valid: false });
  });

  it("rejects an expired token", () => {
    const expired = generateVideoToken("recording_123", -1);
    expect(verifyVideoToken(expired)).toEqual({ valid: false });
  });

  it("rejects a malformed token without throwing", () => {
    expect(verifyVideoToken("not-a-valid-token")).toEqual({ valid: false });
    expect(verifyVideoToken("")).toEqual({ valid: false });
  });

  it("cannot be verified with a different secret (forgery resistance)", () => {
    const token = generateVideoToken("recording_123");
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", "a-different-secret");
    expect(verifyVideoToken(token)).toEqual({ valid: false });
  });

  it("throws on generate when the secret is not configured (fail closed)", () => {
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", "");
    expect(() => generateVideoToken("recording_123")).toThrow(
      "CAL_VIDEO_RECORDING_TOKEN_SECRET is not configured"
    );
  });

  it("returns invalid (does not throw) on verify when the secret is not configured", () => {
    const token = generateVideoToken("recording_123");
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", "");
    expect(verifyVideoToken(token)).toEqual({ valid: false });
  });
});
