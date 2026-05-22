export * from "./constants.js";
export * from "./types.js";
export * from "./errors.js";
export * from "./checksum.js";
export * from "./metadata.js";
export * from "./coverArt.js";
export * from "./chunkJson.js";
export * from "./standardMeta.js";
export * from "./optionalChunks.js";
export {
  encodeLyrc,
  decodeLyrc,
  legacyLinesToSynced,
  type LyrcPayload,
  type LyricLine,
  type LyricSyncedLine,
} from "./lyrc.js";
export {
  encodeSect,
  decodeSect,
  encodeHook,
  decodeHook,
  encodeHilt,
  decodeHilt,
  sortSections,
  sectTypeLabel,
  SECT_TYPES,
  type SectPayload,
  type SongSection,
  type SectType,
  type HookPayload,
  type HiltPayload,
  type HighlightMoment,
  type HighlightUseCase,
  type SectionSource,
} from "./sects.js";
export {
  encodeVisu,
  decodeVisu,
  hasVisuContent,
  parseHexColor,
  type VisuPayload,
  type VisuSource,
  type VisualIntensity,
  type VisuPlayerStyle,
} from "./visu.js";
export {
  encodeCrdt,
  decodeCrdt,
  encodeLicn,
  decodeLicn,
  encodeIden,
  decodeIden,
  hasCrdtContent,
  hasLicnContent,
  hasIdenContent,
  parseTriState,
  parseCrdtObject,
  parseLicnObject,
  parseIdenObject,
  normalizeCrdtRecord,
  normalizeLicnRecord,
  normalizeIdenRecord,
  LICN_INFORMATIONAL_DEFAULT,
  type CrdtPayload,
  type LicnPayload,
  type IdenPayload,
  type TriState,
  type PerformerCredit,
  type AdditionalCredit,
} from "./creditsRights.js";
export {
  encodeFing,
  decodeFing,
  encodeHash,
  decodeHash,
  hasFingContent,
  hasHashContent,
  fingIdentityKey,
  shortHashPreview,
  FING_VERSION,
  HASH_VERSION,
  MAX_CHUNK_HASH_ENTRIES,
  getFingFromParsed,
  getHashFromParsed,
  compareSha256,
  buildIntegrityResult,
  resolveIntegrityStatus,
  isInformationalFileHashMismatch,
  mergeChunkCheck,
  isSha256Hex,
  normalizeSha256Hex,
  type FingPayload,
  type FingSource,
  type AudioFingerprintType,
  type HashPayload,
  type ChunkHashEntry,
  type IntegrityCheckStatus,
  type IntegrityCheckResult,
} from "./optionalChunks.js";
export {
  ALBUM_MANIFEST_FORMAT,
  MAX_ALBUM_TRACKS,
  encodeAlbmPackage,
  decodeAlbm,
  parseAlbmPackageJson,
  validateAlbmPackageManifest,
  manifestToJson,
  albumTrackBasename,
  auditAlbmPackageManifest,
  MAX_TRACK_DURATION_MS,
  type AlbmAuditWarning,
  type AlbmPackageManifest,
  type AlbmAlbumMeta,
  type AlbmTrackRef,
  type AlbmCoverRef,
  type AlbmCoverEmbedded,
  type AlbmCoverFileRef,
  type AlbmValidationError,
} from "./albm.js";
export * from "./validator.js";
export { verifyMp5FileIntegrity, type VerifyIntegrityOptions } from "./verifyIntegrity.js";
export { sha256HexDigest } from "./sha256Digest.js";
export {
  assessMp5Compatibility,
  assessMp5pCompatibility,
  mp5CodecVersionLabel,
  type ValidationProfile,
  type CompatibilityLevel,
  type CompatibilityIssue,
  type Mp5CompatibilityReport,
  type Mp5pCompatibilityReport,
} from "./compatibilityReport.js";
export * from "./containerParser.js";
export {
  parseMp5Async,
  LARGE_MP5_PARSE_BYTES,
  type Mp5ParseProgress,
  type Mp5ParseStage,
} from "./parseMp5Async.js";
export {
  indexMp5FromBlob,
  indexMp5FromByteSource,
  LAZY_INGEST_BYTES,
  EAGER_OPTIONAL_PAYLOAD_MAX,
  getLazyIngestThresholdBytes,
  setLazyIngestThresholdForTests,
  resetLazyIngestThresholdForTests,
  type Mp5IndexProgress,
  type Mp5IndexStage,
} from "./indexMp5Lazy.js";
export { byteSourceFromArrayBuffer, byteSourceFromBlob, type Mp5ByteSource } from "./byteSource.js";
export {
  isLazyMp5,
  loadAudiFrames,
  loadAudiPayload,
  loadStdfFragmentBytes,
  loadStdfFragmentRecord,
  loadStdfFragmentsForStem,
  groupStdfFragmentIndex,
  loadOptionalChunk,
  lazyChunkEntry,
} from "./lazyMp5Load.js";
export type { Mp5ChunkIndexEntry, Mp5LazyHandle, StdfFragmentIndex } from "./types.js";
export {
  writeMp5,
  encodeAudiPayload,
  type WriteMp5Options,
} from "./containerWriter.js";
export { AI_CHUNKS, AI_FOURCC_SET } from "./aiChunks.js";
export type { ChunkRegistryEntry as AiChunkRegistryEntry } from "./aiChunks.js";
export {
  WARNING_CHUNKS,
  ADVANCED_CHUNKS,
  OPTIONAL_FOURCC_SET,
  isOptionalChunk,
  isWarningChunk,
} from "./advancedChunks.js";
export type { ChunkRegistryEntry as AdvancedChunkRegistryEntry } from "./advancedChunks.js";
export { MOONSHOT_FOURCCS, MOONSHOT_FOURCC_SET, isMoonshotChunk } from "./moonshotChunks.js";
export {
  STEM_TYPES,
  STEM_DATA_FOURCC,
  STEM_FRAGMENT_FOURCC,
  STEM_MANIFEST_VERSION,
  STDA_VERSION,
  STDF_VERSION,
  STDA_SAFE_MAX_BYTES,
  encodeStemManifest,
  decodeStemManifest,
  encodeStda,
  decodeStdaEntries,
  buildStemOptionalChunks,
  validateStemManifest,
  validateStemChunks,
  validateStemFromParsed,
  validateStemOptionalMap,
  decodeStemFrameEntries,
  resolveStemStorageMode,
  summarizeStemStorage,
  formatStemExportSizeLog,
  setStdfFragmentPayloadTargetForTests,
  resetStdfFragmentPayloadTarget,
  stemTypeLabel,
  type StemType,
  type StemDescriptor,
  type StemManifest,
  type StemBundleInput,
  type StemStorageMode,
  type StemOptionalChunksResult,
  type StemExportSizeReport,
} from "./stems.js";
export {
  encodeStdfFragment,
  decodeStdfFragment,
  splitStemFrameIntoFragments,
  reconstructStemFrameFromFragments,
  groupStdfFragments,
  type StdfFragmentRecord,
} from "./stemStdf.js";
