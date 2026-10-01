import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPasscode(passcode: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(passcode, salt, 32).toString("hex");
  return { hash, salt };
}

export function verifyPasscode(
  passcode: string,
  hash: string,
  salt: string
): boolean {
  const candidate = scryptSync(passcode, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
