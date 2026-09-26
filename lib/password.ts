import crypto from "crypto";

export const BCRYPT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 10;

/** bcrypt silently ignores everything past 72 bytes, so a longer password would
 *  look accepted while only its first 72 bytes actually counted. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (Buffer.byteLength(pw, "utf8") > 72) return "Use at most 72 characters.";
  if (/^(.)\1+$/.test(pw)) return "Choose a password that is not one repeated character.";
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) {
    return "Do not include your email name in your password.";
  }
  return null;
}

/** Cryptographically random, and without look-alike characters, because an
 *  admin reads it out or types it into a message. Math.random - which the old
 *  code used - is not suitable for credentials. */
export function generateTempPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
