/**
 * Evidence status badge — shows evidence type with color-coded status.
 */

type EvidenceStatus =
  | "VERIFIED"
  | "OBSERVED"
  | "AI_EXTRACTED"
  | "UNVERIFIED"
  | "CONTRADICTED"
  | "STALE"
  | "UNKNOWN"
  | "CALCULATED"
  | "ASSUMED";

interface EvidenceBadgeProps {
  status: EvidenceStatus | string;
  className?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  VERIFIED: { bg: "bg-status-live/10", text: "text-status-live", ring: "ring-status-live/30", label: "VERIFIED" },
  OBSERVED: { bg: "bg-status-updated/10", text: "text-status-updated", ring: "ring-status-updated/30", label: "OBSERVED" },
  AI_EXTRACTED: { bg: "bg-accent/10", text: "text-accent", ring: "ring-accent/30", label: "AI EXTRACTED" },
  UNVERIFIED: { bg: "bg-graphite-800/50", text: "text-graphite-400", ring: "ring-graphite-700", label: "UNVERIFIED" },
  CONTRADICTED: { bg: "bg-status-failed/10", text: "text-status-failed", ring: "ring-status-failed/30", label: "CONTRADICTED" },
  STALE: { bg: "bg-status-stale/10", text: "text-status-stale", ring: "ring-status-stale/30", label: "STALE" },
  UNKNOWN: { bg: "bg-graphite-800/50", text: "text-graphite-500", ring: "ring-graphite-700", label: "UNKNOWN" },
  CALCULATED: { bg: "bg-status-changed/10", text: "text-status-changed", ring: "ring-status-changed/30", label: "CALCULATED" },
  ASSUMED: { bg: "bg-graphite-800/50", text: "text-graphite-400", ring: "ring-graphite-600", label: "ASSUMED" },
};

export function EvidenceBadge({ status, className }: EvidenceBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.UNKNOWN!;

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ring-1 ${style.bg} ${style.text} ${style.ring} ${className ?? ""}`}
    >
      {style.label}
    </span>
  );
}
