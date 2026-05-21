import type { IntegrityCheckResult } from "@mp5/container";
import { shortHashPreview } from "@mp5/container";

const STATUS_LABEL: Record<string, string> = {
  verified: "Verified",
  mismatch: "Mismatch",
  missing: "No fingerprint",
  unsupported: "Partial / unsupported",
  partial: "Partially verified",
};

const STATUS_CLASS: Record<string, string> = {
  verified: "text-green-400/90",
  mismatch: "text-amber-300/90",
  missing: "text-gray-500",
  unsupported: "text-gray-400",
  partial: "text-gray-400",
};

interface Props {
  integrity: IntegrityCheckResult | null;
}

function HashRow({
  label,
  expected,
  ok,
}: {
  label: string;
  expected?: string;
  ok: boolean | null | undefined;
}) {
  if (!expected) return null;
  const preview = shortHashPreview(expected);
  const status =
    ok === true ? "match" : ok === false ? "mismatch" : "not checked";
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-400">
        {preview}{" "}
        <span
          className={
            status === "match"
              ? "text-green-400/80"
              : status === "mismatch"
                ? "text-amber-300/80"
                : "text-gray-600"
          }
        >
          ({status})
        </span>
      </span>
    </div>
  );
}

export function IntegrityDetailsPanel({ integrity }: Props) {
  const status = integrity?.status ?? "missing";
  const hasFp = integrity?.hasFingerprint || integrity?.hasHashChunk;

  return (
    <div
      className="rounded-xl bg-surface-elevated p-4 text-sm space-y-2"
      data-testid="metadata-integrity-panel"
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
        Integrity & fingerprint
      </p>
      <p className="text-[10px] text-gray-600 italic leading-relaxed" data-testid="integrity-disclaimer">
        Fingerprints help detect duplicates and corruption. They are not DRM or legal proof.
      </p>
      <p className="text-xs">
        <span className="text-gray-500">Status: </span>
        <span
          className={STATUS_CLASS[status] ?? "text-gray-400"}
          data-testid="integrity-status"
        >
          {STATUS_LABEL[status] ?? status}
        </span>
        {hasFp ? (
          <span className="text-gray-600" data-testid="integrity-present">
            {" "}
            · fingerprint metadata present
          </span>
        ) : (
          <span className="text-gray-600" data-testid="integrity-absent">
            {" "}
            · no fingerprint metadata
          </span>
        )}
      </p>
      {integrity?.message && (
        <p className="text-xs text-gray-400" data-testid="integrity-message">
          {integrity.message}
        </p>
      )}
      {integrity && status !== "missing" && (
        <div className="space-y-1 pt-1" data-testid="integrity-hashes">
          <HashRow label="PCM" expected={integrity.pcmHash?.expected} ok={integrity.pcmHash?.ok} />
          <HashRow
            label="AUDI"
            expected={integrity.audiHash?.expected}
            ok={integrity.audiHash?.ok}
          />
          <HashRow
            label="File"
            expected={integrity.fileHash?.expected ?? integrity.fileHash?.actual}
            ok={integrity.fileHash?.ok}
          />
        </div>
      )}
      {integrity?.status === "mismatch" && (
        <p
          className="text-xs text-amber-200/80 bg-amber-950/20 rounded-lg px-2 py-1.5"
          data-testid="integrity-mismatch-warning"
        >
          A fingerprint mismatch was detected. Playback continues — verify the file source if
          unexpected.
        </p>
      )}
    </div>
  );
}
