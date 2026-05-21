import {
  decodeJsonChunk,
  encodeJsonChunk,
  sanitizeHttpUrl,
  sanitizeJsonString,
  sanitizeStringArray,
} from "./chunkJson.js";

export const LICN_INFORMATIONAL_DEFAULT =
  "Rights metadata is informational only and may not be verified or enforced.";

export type TriState = true | false | "unknown";

export interface PerformerCredit {
  name: string;
  instrument?: string;
}

export interface AdditionalCredit {
  role: string;
  names: string[];
}

export interface CrdtPayload {
  version?: number;
  primaryArtist?: string[];
  featuredArtists?: string[];
  producer?: string[];
  songwriter?: string[];
  composer?: string[];
  lyricist?: string[];
  mixingEngineer?: string[];
  masteringEngineer?: string[];
  recordingEngineer?: string[];
  label?: string[];
  publisher?: string[];
  copyrightHolder?: string[];
  performers?: PerformerCredit[];
  instruments?: string[];
  additionalCredits?: AdditionalCredit[];
  notes?: string;
}

export interface LicnPayload {
  version?: number;
  copyrightNotice?: string;
  licenseType?: string;
  licenseUrl?: string;
  usageNotes?: string;
  remixAllowed?: TriState;
  commercialUseAllowed?: TriState;
  attributionRequired?: TriState;
  informationalOnly?: string;
}

export interface IdenPayload {
  version?: number;
  isrc?: string;
  upc?: string;
  ean?: string;
  catalogNumber?: string;
  releaseId?: string;
  artistUrl?: string;
  albumUrl?: string;
  sourceUrl?: string;
  distributor?: string;
  releaseDate?: string;
  originalReleaseDate?: string;
}

const MAX_PEOPLE_PER_ROLE = 32;
const MAX_NAME_LEN = 128;
const MAX_NOTES_LEN = 4096;
const MAX_ADDITIONAL_CREDITS = 48;
const MAX_ROLE_NAME_LEN = 64;
const MAX_LICENSE_TEXT = 512;
const MAX_IDENTIFIER_LEN = 64;

const ROLE_KEYS = [
  "primaryArtist",
  "featuredArtists",
  "producer",
  "songwriter",
  "composer",
  "lyricist",
  "mixingEngineer",
  "masteringEngineer",
  "recordingEngineer",
  "label",
  "publisher",
  "copyrightHolder",
] as const;

export function parseTriState(v: unknown): TriState | undefined {
  if (v === true) return true;
  if (v === false) return false;
  if (v === "unknown" || v === "unspecified") return "unknown";
  return undefined;
}

function parsePeopleList(arr: unknown): string[] {
  return sanitizeStringArray(arr, MAX_PEOPLE_PER_ROLE, MAX_NAME_LEN).filter(
    (s) => !/[<>&]/.test(s),
  );
}

function parseRoleName(s: unknown): string | undefined {
  const v = sanitizeJsonString(s, MAX_ROLE_NAME_LEN);
  if (!v) return undefined;
  if (/[<>&]/.test(v)) return undefined;
  return v;
}

function parsePerformers(arr: unknown): PerformerCredit[] {
  if (!Array.isArray(arr)) return [];
  const out: PerformerCredit[] = [];
  for (const item of arr.slice(0, MAX_PEOPLE_PER_ROLE)) {
    if (typeof item === "string") {
      const name = sanitizeJsonString(item, MAX_NAME_LEN);
      if (name) out.push({ name });
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      const name = sanitizeJsonString(o.name, MAX_NAME_LEN);
      if (!name) continue;
      const instrument = sanitizeJsonString(o.instrument, 64);
      out.push(instrument ? { name, instrument } : { name });
    }
  }
  return out;
}

function parseAdditionalCredits(arr: unknown): AdditionalCredit[] {
  if (!Array.isArray(arr)) return [];
  const out: AdditionalCredit[] = [];
  for (const item of arr.slice(0, MAX_ADDITIONAL_CREDITS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const role = parseRoleName(o.role);
    const names = parsePeopleList(o.names);
    if (!role || !names.length) continue;
    out.push({ role, names });
  }
  return out;
}

function parseIsrc(s: unknown): string | undefined {
  const v = sanitizeJsonString(s, 24);
  if (!v) return undefined;
  const compact = v.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{12}$/.test(compact)) return undefined;
  return compact;
}

function parseBarcode(s: unknown, maxLen: number): string | undefined {
  const v = sanitizeJsonString(s, maxLen + 8);
  if (!v) return undefined;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > maxLen) return undefined;
  return digits;
}

function sanitizeIdentifier(s: unknown, maxLen: number): string | undefined {
  const v = sanitizeJsonString(s, maxLen);
  if (!v) return undefined;
  if (/[<>&]/.test(v)) return undefined;
  return v;
}

export function hasCrdtContent(p: CrdtPayload): boolean {
  return !!(
    p.primaryArtist?.length ||
    p.featuredArtists?.length ||
    p.producer?.length ||
    p.songwriter?.length ||
    p.composer?.length ||
    p.lyricist?.length ||
    p.mixingEngineer?.length ||
    p.masteringEngineer?.length ||
    p.recordingEngineer?.length ||
    p.label?.length ||
    p.publisher?.length ||
    p.copyrightHolder?.length ||
    p.performers?.length ||
    p.instruments?.length ||
    p.additionalCredits?.length ||
    p.notes
  );
}

export function hasLicnContent(p: LicnPayload): boolean {
  return !!(
    p.copyrightNotice ||
    p.licenseType ||
    p.licenseUrl ||
    p.usageNotes ||
    p.remixAllowed !== undefined ||
    p.commercialUseAllowed !== undefined ||
    p.attributionRequired !== undefined
  );
}

export function hasIdenContent(p: IdenPayload): boolean {
  return !!(
    p.isrc ||
    p.upc ||
    p.ean ||
    p.catalogNumber ||
    p.releaseId ||
    p.artistUrl ||
    p.albumUrl ||
    p.sourceUrl ||
    p.distributor ||
    p.releaseDate ||
    p.originalReleaseDate
  );
}

export function normalizeCrdtRecord(raw: Record<string, unknown>): CrdtPayload | null {
  const payload: CrdtPayload = { version: 1 };
  for (const key of ROLE_KEYS) {
    const list = parsePeopleList(raw[key]);
    if (list.length) (payload as Record<string, unknown>)[key] = list;
  }
  const performers = parsePerformers(raw.performers);
  if (performers.length) payload.performers = performers;
  const instruments = parsePeopleList(raw.instruments);
  if (instruments.length) payload.instruments = instruments;
  const additionalCredits = parseAdditionalCredits(raw.additionalCredits);
  if (additionalCredits.length) payload.additionalCredits = additionalCredits;
  const notes = sanitizeJsonString(raw.notes, MAX_NOTES_LEN);
  if (notes) payload.notes = notes;
  return hasCrdtContent(payload) ? payload : null;
}

export function normalizeLicnRecord(raw: Record<string, unknown>): LicnPayload | null {
  const payload: LicnPayload = {
    version: 1,
    copyrightNotice: sanitizeJsonString(raw.copyrightNotice, MAX_LICENSE_TEXT),
    licenseType: sanitizeJsonString(raw.licenseType, MAX_LICENSE_TEXT),
    licenseUrl: sanitizeHttpUrl(raw.licenseUrl),
    usageNotes: sanitizeJsonString(raw.usageNotes, MAX_NOTES_LEN),
    remixAllowed: parseTriState(raw.remixAllowed),
    commercialUseAllowed: parseTriState(raw.commercialUseAllowed),
    attributionRequired: parseTriState(raw.attributionRequired),
    informationalOnly:
      sanitizeJsonString(raw.informationalOnly, MAX_LICENSE_TEXT) ?? LICN_INFORMATIONAL_DEFAULT,
  };
  return hasLicnContent(payload) ? payload : null;
}

export function normalizeIdenRecord(raw: Record<string, unknown>): IdenPayload | null {
  const payload: IdenPayload = {
    version: 1,
    isrc: parseIsrc(raw.isrc),
    upc: parseBarcode(raw.upc, 14),
    ean: parseBarcode(raw.ean, 14),
    catalogNumber: sanitizeIdentifier(raw.catalogNumber, MAX_IDENTIFIER_LEN),
    releaseId: sanitizeIdentifier(raw.releaseId, MAX_IDENTIFIER_LEN),
    artistUrl: sanitizeHttpUrl(raw.artistUrl),
    albumUrl: sanitizeHttpUrl(raw.albumUrl),
    sourceUrl: sanitizeHttpUrl(raw.sourceUrl),
    distributor: sanitizeJsonString(raw.distributor, MAX_NAME_LEN),
    releaseDate: sanitizeJsonString(raw.releaseDate, 32),
    originalReleaseDate: sanitizeJsonString(raw.originalReleaseDate, 32),
  };
  return hasIdenContent(payload) ? payload : null;
}

export function encodeCrdt(p: CrdtPayload): Uint8Array {
  const normalized = normalizeCrdtRecord(p as unknown as Record<string, unknown>);
  if (!normalized) throw new Error("CRDT payload has no credit fields");
  return encodeJsonChunk(normalized);
}

export function decodeCrdt(data?: Uint8Array): CrdtPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "CRDT");
  if (!raw) return null;
  return normalizeCrdtRecord(raw);
}

export function encodeLicn(p: LicnPayload): Uint8Array {
  const normalized = normalizeLicnRecord({
    ...p,
    informationalOnly: p.informationalOnly ?? LICN_INFORMATIONAL_DEFAULT,
  } as unknown as Record<string, unknown>);
  if (!normalized) throw new Error("LICN payload has no rights fields");
  return encodeJsonChunk(normalized);
}

export function decodeLicn(data?: Uint8Array): LicnPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "LICN");
  if (!raw) return null;
  return normalizeLicnRecord(raw);
}

export function encodeIden(p: IdenPayload): Uint8Array {
  const normalized = normalizeIdenRecord(p as unknown as Record<string, unknown>);
  if (!normalized) throw new Error("IDEN payload has no identifier fields");
  return encodeJsonChunk(normalized);
}

export function decodeIden(data?: Uint8Array): IdenPayload | null {
  const raw = decodeJsonChunk<Record<string, unknown>>(data, "IDEN");
  if (!raw) return null;
  return normalizeIdenRecord(raw);
}

/** Parse CRDT/LICN/IDEN from album manifest JSON objects (not chunk bytes). */
export function parseCrdtObject(raw: unknown): CrdtPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return normalizeCrdtRecord(raw as Record<string, unknown>);
}

export function parseLicnObject(raw: unknown): LicnPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return normalizeLicnRecord(raw as Record<string, unknown>);
}

export function parseIdenObject(raw: unknown): IdenPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return normalizeIdenRecord(raw as Record<string, unknown>);
}
