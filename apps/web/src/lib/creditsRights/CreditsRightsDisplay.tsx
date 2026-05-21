import type { CrdtPayload, IdenPayload, LicnPayload } from "@mp5/container";
import { LICN_INFORMATIONAL_DEFAULT } from "@mp5/container";

const ROLE_LABELS: { key: keyof CrdtPayload; label: string }[] = [
  { key: "primaryArtist", label: "Primary artist" },
  { key: "featuredArtists", label: "Featured artists" },
  { key: "producer", label: "Producer" },
  { key: "songwriter", label: "Songwriter" },
  { key: "composer", label: "Composer" },
  { key: "lyricist", label: "Lyricist" },
  { key: "mixingEngineer", label: "Mixing engineer" },
  { key: "masteringEngineer", label: "Mastering engineer" },
  { key: "recordingEngineer", label: "Recording engineer" },
  { key: "label", label: "Label" },
  { key: "publisher", label: "Publisher" },
  { key: "copyrightHolder", label: "Copyright holder" },
];

function triStateLabel(v: boolean | "unknown" | undefined): string | null {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v === "unknown") return "Unknown";
  return null;
}

function CreditList({ names }: { names: string[] }) {
  return (
    <ul className="text-xs text-gray-300 space-y-0.5">
      {names.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

export function CreditsSection({
  crdt,
  testId = "metadata-credits-section",
}: {
  crdt?: CrdtPayload | null;
  testId?: string;
}) {
  if (!crdt) return null;
  const hasRole = ROLE_LABELS.some((r) => (crdt[r.key] as string[] | undefined)?.length);
  const hasExtra =
    crdt.performers?.length ||
    crdt.instruments?.length ||
    crdt.additionalCredits?.length ||
    crdt.notes;
  if (!hasRole && !hasExtra) return null;

  return (
    <div className="space-y-2" data-testid={testId}>
      {ROLE_LABELS.map(({ key, label }) => {
        const names = crdt[key] as string[] | undefined;
        if (!names?.length) return null;
        return (
          <div key={key}>
            <p className="text-[10px] text-gray-500">{label}</p>
            <CreditList names={names} />
          </div>
        );
      })}
      {crdt.performers?.length ? (
        <div>
          <p className="text-[10px] text-gray-500">Performers</p>
          <ul className="text-xs text-gray-300 space-y-0.5">
            {crdt.performers.map((p) => (
              <li key={`${p.name}-${p.instrument ?? ""}`}>
                {p.name}
                {p.instrument ? ` — ${p.instrument}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {crdt.instruments?.length ? (
        <div>
          <p className="text-[10px] text-gray-500">Instruments</p>
          <CreditList names={crdt.instruments} />
        </div>
      ) : null}
      {crdt.additionalCredits?.length ? (
        <div>
          <p className="text-[10px] text-gray-500">Additional credits</p>
          <ul className="text-xs text-gray-300 space-y-1">
            {crdt.additionalCredits.map((c) => (
              <li key={c.role}>
                <span className="text-gray-500">{c.role}: </span>
                {c.names.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {crdt.notes ? (
        <p className="text-xs text-gray-400 whitespace-pre-wrap">{crdt.notes}</p>
      ) : null}
    </div>
  );
}

export function RightsSection({
  licn,
  testId = "metadata-rights-section",
}: {
  licn?: LicnPayload | null;
  testId?: string;
}) {
  if (!licn) return null;
  const hasFields =
    licn.copyrightNotice ||
    licn.licenseType ||
    licn.licenseUrl ||
    licn.usageNotes ||
    licn.remixAllowed !== undefined ||
    licn.commercialUseAllowed !== undefined ||
    licn.attributionRequired !== undefined;
  if (!hasFields) return null;

  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-[10px] text-gray-500 italic" data-testid="metadata-rights-disclaimer">
        {licn.informationalOnly ?? LICN_INFORMATIONAL_DEFAULT}
      </p>
      {licn.copyrightNotice && (
        <p className="text-xs text-gray-300">
          <span className="text-gray-500">Copyright: </span>
          {licn.copyrightNotice}
        </p>
      )}
      {licn.licenseType && (
        <p className="text-xs text-gray-300">
          <span className="text-gray-500">License: </span>
          {licn.licenseType}
        </p>
      )}
      {licn.licenseUrl && (
        <p className="text-xs">
          <a
            href={licn.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent/90 hover:underline break-all"
          >
            {licn.licenseUrl}
          </a>
        </p>
      )}
      {licn.usageNotes && (
        <p className="text-xs text-gray-400 whitespace-pre-wrap">{licn.usageNotes}</p>
      )}
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        {(["remixAllowed", "commercialUseAllowed", "attributionRequired"] as const).map((k) => {
          const label = triStateLabel(licn[k]);
          if (!label) return null;
          const titles = {
            remixAllowed: "Remix allowed",
            commercialUseAllowed: "Commercial use",
            attributionRequired: "Attribution required",
          };
          return (
            <div key={k} className="contents">
              <dt className="text-gray-500">{titles[k]}</dt>
              <dd>{label}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function IdentifiersSection({
  iden,
  testId = "metadata-identifiers-section",
}: {
  iden?: IdenPayload | null;
  testId?: string;
}) {
  if (!iden) return null;
  const rows: { label: string; value: string; url?: boolean }[] = [];
  if (iden.isrc) rows.push({ label: "ISRC", value: iden.isrc });
  if (iden.upc) rows.push({ label: "UPC", value: iden.upc });
  if (iden.ean) rows.push({ label: "EAN", value: iden.ean });
  if (iden.catalogNumber) rows.push({ label: "Catalog", value: iden.catalogNumber });
  if (iden.releaseId) rows.push({ label: "Release ID", value: iden.releaseId });
  if (iden.distributor) rows.push({ label: "Distributor", value: iden.distributor });
  if (iden.releaseDate) rows.push({ label: "Release date", value: iden.releaseDate });
  if (iden.originalReleaseDate)
    rows.push({ label: "Original release", value: iden.originalReleaseDate });
  if (iden.artistUrl) rows.push({ label: "Artist URL", value: iden.artistUrl, url: true });
  if (iden.albumUrl) rows.push({ label: "Album URL", value: iden.albumUrl, url: true });
  if (iden.sourceUrl) rows.push({ label: "Source URL", value: iden.sourceUrl, url: true });
  if (!rows.length) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs" data-testid={testId}>
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-gray-500">{r.label}</dt>
          <dd className="break-all">
            {r.url ? (
              <a href={r.value} target="_blank" rel="noopener noreferrer" className="text-accent/90 hover:underline">
                {r.value}
              </a>
            ) : (
              r.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
