import { decodeExpl, decodeRecv, decodeSafe, decodeSens } from "@mp5/container";
import {
  CHUNK_DISPLAY_NAME,
  CONTENT_GUIDANCE_PLAYER_HELP,
  formatWarningSourceLabel,
  SECTION,
} from "../lib/metadataLabels";

interface Props {
  optional: Map<string, Uint8Array>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 text-xs border border-gray-700">
      {children}
    </span>
  );
}

function GuidanceSection({
  title,
  badges,
  testId,
}: {
  title: string;
  badges: string[];
  testId: string;
}) {
  if (!badges.length) return null;
  return (
    <div className="space-y-1" data-testid={testId}>
      <p className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">{title}</p>
      <div className="flex flex-wrap gap-1">
        {badges.map((w) => (
          <Badge key={w}>{w}</Badge>
        ))}
      </div>
    </div>
  );
}

export function ContentWarningsPanel({ optional }: Props) {
  let expl, safe, recv, sens;
  try {
    expl = decodeExpl(optional.get("EXPL"));
    safe = decodeSafe(optional.get("SAFE"));
    recv = decodeRecv(optional.get("RECV"));
    sens = decodeSens(optional.get("SENS"));
  } catch {
    return (
      <div className="rounded-xl bg-surface-elevated p-4 text-sm" data-testid="content-warnings-panel">
        <p className="text-xs text-gray-500 italic">Content guidance could not be read.</p>
      </div>
    );
  }

  const explBadges: string[] = [];
  if (expl?.explicit) explBadges.push("Explicit content");
  if (expl?.cleanVersionAvailable) explBadges.push("Clean version");
  if (expl?.strongLanguage) explBadges.push("Strong language");
  if (expl?.sexualContent) explBadges.push("Sexual content");
  if (expl?.violence) explBadges.push("Violence");
  if (expl?.drugReferences) explBadges.push("Drug references");
  if (expl?.alcoholReferences) explBadges.push("Alcohol references");
  if (expl?.matureThemes) explBadges.push("Mature themes");
  if (expl?.selfHarmThemes) explBadges.push("Self-harm themes");
  if (expl?.traumaThemes) explBadges.push("Trauma themes");
  if (expl?.contentWarnings?.length) explBadges.push(...expl.contentWarnings);

  const safeBadges: string[] = [];
  if (safe?.tags?.length) safeBadges.push(...safe.tags);
  if (safe?.griefThemes) safeBadges.push("Grief themes");
  if (safe?.traumaThemes) safeBadges.push("Trauma themes");
  if (safe?.distressingThemes) safeBadges.push("Distressing themes");
  if (safe?.panicHeavy) safeBadges.push("Intense emotional content");

  const sensBadges: string[] = [];
  if (sens?.warnings?.length) sensBadges.push(...sens.warnings);
  if (sens?.suddenLoudSounds) sensBadges.push("Sudden loud sounds");
  if (sens?.harshFrequencies) sensBadges.push("Harsh frequencies");
  if (sens?.intenseBass) sensBadges.push("Intense bass");
  if (sens?.sensoryOverloadRisk) sensBadges.push("Sensory overload risk");

  const recvBadges: string[] = [];
  if (recv?.triggers?.length) recvBadges.push(...recv.triggers);
  if (recv?.drugReferences) recvBadges.push("Drug references");
  if (recv?.alcoholReferences) recvBadges.push("Alcohol references");
  if (recv?.relapseThemes) recvBadges.push("Relapse themes");
  if (recv?.cravingTriggers) recvBadges.push("Craving triggers");
  if (recv?.groundingFriendly) recvBadges.push("Grounding-friendly");
  if (recv?.panicFriendly) recvBadges.push("Panic-friendly");
  if (recv?.recoverySafe) recvBadges.push("Recovery-sensitive");

  const hasAny =
    explBadges.length || safeBadges.length || sensBadges.length || recvBadges.length;

  if (!hasAny) {
    return (
      <div className="rounded-xl bg-surface-elevated p-4 text-sm" data-testid="content-warnings-empty">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
          Content guidance
        </p>
        <p className="text-xs text-gray-500 italic">No content guidance embedded</p>
      </div>
    );
  }

  const aiTagged =
    expl?.aiGenerated || safe?.aiGenerated || recv?.aiGenerated || sens?.aiGenerated;

  const sourceLabels = [
    ...new Set(
      [expl?.warningSource, safe?.warningSource, sens?.warningSource, recv?.warningSource]
        .filter(Boolean)
        .map((s) => formatWarningSourceLabel(s)),
    ),
  ];

  return (
    <div
      className="rounded-xl bg-surface-elevated border border-gray-700/50 p-4 text-sm space-y-3"
      data-testid="content-warnings-panel"
    >
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
          Content guidance
        </p>
        <p className="text-xs text-gray-500">{CONTENT_GUIDANCE_PLAYER_HELP}</p>
        {sourceLabels.length > 0 && (
          <p className="text-[10px] text-gray-600 mt-1" data-testid="content-guidance-source">
            Source: {sourceLabels.join(", ")}
          </p>
        )}
      </div>

      <GuidanceSection
        title={CHUNK_DISPLAY_NAME.EXPL ?? SECTION.contentNotices}
        badges={explBadges}
        testId="guidance-content-notices"
      />
      <GuidanceSection
        title={CHUNK_DISPLAY_NAME.SAFE ?? SECTION.sensitiveThemes}
        badges={safeBadges}
        testId="guidance-sensitive-themes"
      />
      <GuidanceSection
        title={CHUNK_DISPLAY_NAME.SENS ?? SECTION.listenerComfort}
        badges={sensBadges}
        testId="guidance-listener-comfort"
      />
      <GuidanceSection
        title={CHUNK_DISPLAY_NAME.RECV ?? SECTION.havenRecoveryProfile}
        badges={recvBadges}
        testId="guidance-haven-recovery-profile"
      />

      {aiTagged && (
        <p className="text-[10px] text-amber-200/80">
          Some labels are marked AI-generated — treat with caution.
        </p>
      )}
    </div>
  );
}
