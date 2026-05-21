import type { AdditionalCredit, CrdtPayload, PerformerCredit } from "@mp5/container";

/** One name per line in converter text fields. */
export function formatNameList(names: string[] | undefined): string {
  return (names ?? []).join("\n");
}

export function parseNameList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 32);
}

export function formatPerformers(performers: PerformerCredit[] | undefined): string {
  return (performers ?? [])
    .map((p) => (p.instrument ? `${p.name} | ${p.instrument}` : p.name))
    .join("\n");
}

export function parsePerformersText(text: string): PerformerCredit[] {
  const out: PerformerCredit[] = [];
  for (const line of text.split(/\r?\n/).slice(0, 32)) {
    const t = line.trim();
    if (!t) continue;
    const pipe = t.indexOf("|");
    if (pipe >= 0) {
      const name = t.slice(0, pipe).trim();
      const instrument = t.slice(pipe + 1).trim();
      if (name) out.push(instrument ? { name, instrument } : { name });
    } else {
      out.push({ name: t });
    }
  }
  return out;
}

export function formatAdditionalCredits(credits: AdditionalCredit[] | undefined): string {
  return (credits ?? [])
    .map((c) => `${c.role}: ${c.names.join(", ")}`)
    .join("\n");
}

export function parseAdditionalCreditsText(text: string): AdditionalCredit[] {
  const out: AdditionalCredit[] = [];
  for (const line of text.split(/\r?\n/).slice(0, 48)) {
    const t = line.trim();
    if (!t) continue;
    const colon = t.indexOf(":");
    if (colon < 1) continue;
    const role = t.slice(0, colon).trim();
    const names = t
      .slice(colon + 1)
      .split(/[,;]+/)
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 32);
    if (role && names.length) out.push({ role, names });
  }
  return out;
}

export function crdtEditsFromPayload(p: CrdtPayload | null | undefined) {
  if (!p) return emptyCrdtEdits();
  return {
    primaryArtist: formatNameList(p.primaryArtist),
    featuredArtists: formatNameList(p.featuredArtists),
    producer: formatNameList(p.producer),
    songwriter: formatNameList(p.songwriter),
    composer: formatNameList(p.composer),
    lyricist: formatNameList(p.lyricist),
    mixingEngineer: formatNameList(p.mixingEngineer),
    masteringEngineer: formatNameList(p.masteringEngineer),
    recordingEngineer: formatNameList(p.recordingEngineer),
    label: formatNameList(p.label),
    publisher: formatNameList(p.publisher),
    copyrightHolder: formatNameList(p.copyrightHolder),
    performers: formatPerformers(p.performers),
    instruments: formatNameList(p.instruments),
    additionalCredits: formatAdditionalCredits(p.additionalCredits),
    notes: p.notes ?? "",
  };
}

export function emptyCrdtEdits() {
  return {
    primaryArtist: "",
    featuredArtists: "",
    producer: "",
    songwriter: "",
    composer: "",
    lyricist: "",
    mixingEngineer: "",
    masteringEngineer: "",
    recordingEngineer: "",
    label: "",
    publisher: "",
    copyrightHolder: "",
    performers: "",
    instruments: "",
    additionalCredits: "",
    notes: "",
  };
}

export type ManualCrdtEdits = ReturnType<typeof emptyCrdtEdits>;

export function crdtPayloadFromEdits(e: ManualCrdtEdits) {
  const payload: CrdtPayload = { version: 1 };
  const setList = (key: keyof CrdtPayload, text: string) => {
    const list = parseNameList(text);
    if (list.length) (payload as Record<string, unknown>)[key] = list;
  };
  setList("primaryArtist", e.primaryArtist);
  setList("featuredArtists", e.featuredArtists);
  setList("producer", e.producer);
  setList("songwriter", e.songwriter);
  setList("composer", e.composer);
  setList("lyricist", e.lyricist);
  setList("mixingEngineer", e.mixingEngineer);
  setList("masteringEngineer", e.masteringEngineer);
  setList("recordingEngineer", e.recordingEngineer);
  setList("label", e.label);
  setList("publisher", e.publisher);
  setList("copyrightHolder", e.copyrightHolder);
  const performers = parsePerformersText(e.performers);
  if (performers.length) payload.performers = performers;
  const instruments = parseNameList(e.instruments);
  if (instruments.length) payload.instruments = instruments;
  const additionalCredits = parseAdditionalCreditsText(e.additionalCredits);
  if (additionalCredits.length) payload.additionalCredits = additionalCredits;
  const notes = e.notes.trim();
  if (notes) payload.notes = notes;
  return payload;
}

export function hasCrdtEdits(e: ManualCrdtEdits): boolean {
  return Object.values(e).some((v) => (typeof v === "string" ? v.trim() : false));
}

export type TriStateEdit = "" | "true" | "false" | "unknown";

export function triStateFromPayload(v: boolean | "unknown" | undefined): TriStateEdit {
  if (v === true) return "true";
  if (v === false) return "false";
  if (v === "unknown") return "unknown";
  return "";
}

export function triStateToPayload(v: TriStateEdit) {
  if (v === "true") return true as const;
  if (v === "false") return false as const;
  if (v === "unknown") return "unknown" as const;
  return undefined;
}

export function emptyLicnEdits() {
  return {
    copyrightNotice: "",
    licenseType: "",
    licenseUrl: "",
    usageNotes: "",
    remixAllowed: "" as TriStateEdit,
    commercialUseAllowed: "" as TriStateEdit,
    attributionRequired: "" as TriStateEdit,
  };
}

export type ManualLicnEdits = ReturnType<typeof emptyLicnEdits>;

export function licnEditsFromPayload(p: import("@mp5/container").LicnPayload | null | undefined) {
  if (!p) return emptyLicnEdits();
  return {
    copyrightNotice: p.copyrightNotice ?? "",
    licenseType: p.licenseType ?? "",
    licenseUrl: p.licenseUrl ?? "",
    usageNotes: p.usageNotes ?? "",
    remixAllowed: triStateFromPayload(p.remixAllowed),
    commercialUseAllowed: triStateFromPayload(p.commercialUseAllowed),
    attributionRequired: triStateFromPayload(p.attributionRequired),
  };
}

export function licnPayloadFromEdits(e: ManualLicnEdits) {
  const payload: import("@mp5/container").LicnPayload = { version: 1 };
  const cn = e.copyrightNotice.trim();
  if (cn) payload.copyrightNotice = cn;
  const lt = e.licenseType.trim();
  if (lt) payload.licenseType = lt;
  const lu = e.licenseUrl.trim();
  if (lu) payload.licenseUrl = lu;
  const un = e.usageNotes.trim();
  if (un) payload.usageNotes = un;
  const remix = triStateToPayload(e.remixAllowed);
  if (remix !== undefined) payload.remixAllowed = remix;
  const commercial = triStateToPayload(e.commercialUseAllowed);
  if (commercial !== undefined) payload.commercialUseAllowed = commercial;
  const attrib = triStateToPayload(e.attributionRequired);
  if (attrib !== undefined) payload.attributionRequired = attrib;
  return payload;
}

export function hasLicnEdits(e: ManualLicnEdits): boolean {
  return Object.values(e).some((v) => v !== "");
}

export function emptyIdenEdits() {
  return {
    isrc: "",
    upc: "",
    ean: "",
    catalogNumber: "",
    releaseId: "",
    artistUrl: "",
    albumUrl: "",
    sourceUrl: "",
    distributor: "",
    releaseDate: "",
    originalReleaseDate: "",
  };
}

export type ManualIdenEdits = ReturnType<typeof emptyIdenEdits>;

export function idenEditsFromPayload(p: import("@mp5/container").IdenPayload | null | undefined) {
  if (!p) return emptyIdenEdits();
  return {
    isrc: p.isrc ?? "",
    upc: p.upc ?? "",
    ean: p.ean ?? "",
    catalogNumber: p.catalogNumber ?? "",
    releaseId: p.releaseId ?? "",
    artistUrl: p.artistUrl ?? "",
    albumUrl: p.albumUrl ?? "",
    sourceUrl: p.sourceUrl ?? "",
    distributor: p.distributor ?? "",
    releaseDate: p.releaseDate ?? "",
    originalReleaseDate: p.originalReleaseDate ?? "",
  };
}

export function idenPayloadFromEdits(e: ManualIdenEdits) {
  const payload: import("@mp5/container").IdenPayload = { version: 1 };
  const set = (key: keyof ManualIdenEdits) => {
    const v = e[key].trim();
    if (v) (payload as Record<string, string>)[key] = v;
  };
  for (const k of Object.keys(emptyIdenEdits()) as (keyof ManualIdenEdits)[]) {
    set(k);
  }
  return payload;
}

export function hasIdenEdits(e: ManualIdenEdits): boolean {
  return Object.values(e).some((v) => v.trim());
}
