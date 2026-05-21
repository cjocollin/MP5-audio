const HEX = /^[a-f0-9]{64}$/i;

export function isSha256Hex(s: unknown): s is string {
  return typeof s === "string" && HEX.test(s);
}

/** Lowercase hex SHA-256 (64 chars). */
export function normalizeSha256Hex(s: unknown): string | undefined {
  if (!isSha256Hex(s)) return undefined;
  return s.toLowerCase();
}
