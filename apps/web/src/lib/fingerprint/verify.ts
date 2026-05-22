import type { IntegrityCheckResult, Mp5File } from "@mp5/container";
import { verifyMp5FileIntegrity } from "@mp5/container";

export interface VerifyMp5Options {
  /** When provided, PCM hash in FING can be verified. */
  pcmSamples?: Int16Array;
}

export async function verifyMp5Integrity(
  parsed: Mp5File,
  fileBytes?: Uint8Array,
  opts?: VerifyMp5Options,
): Promise<IntegrityCheckResult> {
  return verifyMp5FileIntegrity(parsed, fileBytes, opts);
}
