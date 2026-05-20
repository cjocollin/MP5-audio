import { Mp5ParseError, Mp5SecurityError } from "./errors.js";
import { sanitizeMetadata } from "./metadata.js";

export const MAX_JSON_CHUNK = 64 * 1024;

export function encodeJsonChunk(value: unknown, maxBytes = MAX_JSON_CHUNK): Uint8Array {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > maxBytes) {
    throw new Mp5SecurityError(`JSON chunk exceeds ${maxBytes} bytes`);
  }
  return bytes;
}

export function decodeJsonChunk<T extends Record<string, unknown>>(
  payload: Uint8Array | undefined,
  chunkName: string,
): T | null {
  if (!payload?.length) return null;
  if (payload.length > MAX_JSON_CHUNK) {
    throw new Mp5ParseError(`${chunkName} chunk too large`);
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

export function sanitizeJsonString(s: unknown, maxLen = 4096): string | undefined {
  if (typeof s !== "string") return undefined;
  return sanitizeMetadata(s).slice(0, maxLen);
}

export function sanitizeStringArray(arr: unknown, maxItems = 32, maxLen = 128): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string")
    .slice(0, maxItems)
    .map((s) => sanitizeMetadata(s).slice(0, maxLen))
    .filter(Boolean);
}
