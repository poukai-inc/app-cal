import { createHmac, timingSafeEqual } from "node:crypto";

function getTokenSecret(): string {
  const secret = process.env.CAL_VIDEO_RECORDING_TOKEN_SECRET;
  if (!secret) {
    // Fail closed: a default secret would let anyone forge valid recording tokens.
    throw new Error("CAL_VIDEO_RECORDING_TOKEN_SECRET is not configured");
  }
  return secret;
}

// 262992 minutes is 6 months
export function generateVideoToken(recordingId: string, expiresInMinutes = 262992) {
  const secret = getTokenSecret();
  const expires = Date.now() + expiresInMinutes * 60 * 1000;

  const payload = `${recordingId}:${expires}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");

  return `${payload}:${hmac}`;
}

export function verifyVideoToken(token: string): {
  valid: boolean;
  recordingId?: string;
} {
  try {
    const [recordingId, expires, receivedHmac] = token.split(":");
    const secret = getTokenSecret();

    if (Date.now() > parseInt(expires, 10)) {
      return { valid: false };
    }

    // Verify HMAC
    const payload = `${recordingId}:${expires}`;
    const expectedHmac = createHmac("sha256", secret).update(payload).digest("hex");

    const receivedBuf = Buffer.from(receivedHmac ?? "", "hex");
    const expectedBuf = Buffer.from(expectedHmac, "hex");
    if (receivedBuf.length !== expectedBuf.length || !timingSafeEqual(receivedBuf, expectedBuf)) {
      return { valid: false };
    }

    return { valid: true, recordingId };
  } catch {
    return { valid: false };
  }
}
