/** PLT-03: rules for a new password. Pure, so the form, the server action and the tests share them. */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordValues = { current: string; next: string; confirm: string };
export type PasswordErrors = Partial<Record<"current" | "next" | "confirm", string>>;

/**
 * PLT-03 AC2. The messages are keys in messages/en.json. Whether the current password is correct is
 * decided by the server (it signs in with it); everything else is decided here.
 */
export function validatePasswordChange(v: PasswordValues): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!v.current) errors.current = "errors.required";
  if (v.next.length < MIN_PASSWORD_LENGTH) errors.next = "password.errors.tooShort";
  else if (v.current && v.next === v.current) errors.next = "password.errors.same";
  if (v.confirm !== v.next) errors.confirm = "password.errors.mismatch";
  return errors;
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const ALPHABET = UPPER + LOWER + DIGIT;
export const TEMP_PASSWORD_LENGTH = 12;

/**
 * A temporary password for a reset: 12 characters, at least one upper-case letter, one lower-case letter and
 * one digit, without look-alike characters (0 O 1 l I). `pick` is injectable for tests; the default uses
 * the cryptographic generator. It is shown once and never stored or logged.
 */
export function generateTempPassword(pick: (max: number) => number = (max) => cryptoInt(max)): string {
  const chars = [UPPER, LOWER, DIGIT].map((set) => set[pick(set.length)]);
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(ALPHABET[pick(ALPHABET.length)]);
  // Fisher-Yates, so the three required characters are not always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function cryptoInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max; // no modulo bias
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    globalThis.crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}
