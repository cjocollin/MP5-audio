import { decodeFing, fingIdentityKey, type FingPayload } from "@mp5/container";
import type { LocalLibraryRecord } from "../localLibrary/types";

export interface DuplicateMatch {
  record: LocalLibraryRecord;
  reason: "fingerprint" | "filename-size";
}

export function identityKeyFromFing(fing: FingPayload | null | undefined): string | undefined {
  return fingIdentityKey(fing);
}

export function identityKeyFromOptional(optional: Map<string, Uint8Array> | undefined): string | undefined {
  if (!optional) return undefined;
  try {
    return identityKeyFromFing(decodeFing(optional.get("FING")));
  } catch {
    return undefined;
  }
}

export function findLibraryDuplicate(
  records: LocalLibraryRecord[],
  opts: {
    filename: string;
    fileSize: number;
    identityKey?: string;
  },
): DuplicateMatch | null {
  if (opts.identityKey) {
    const byFp = records.find((r) => r.summary.fingerprintKey === opts.identityKey);
    if (byFp) return { record: byFp, reason: "fingerprint" };
  }
  const byName = records.find(
    (r) => r.filename === opts.filename && r.fileSize === opts.fileSize,
  );
  if (byName) return { record: byName, reason: "filename-size" };
  return null;
}
