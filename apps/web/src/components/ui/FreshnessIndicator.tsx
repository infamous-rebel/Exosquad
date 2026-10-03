/**
 * Data freshness indicator — shows how old the data is.
 */

interface FreshnessIndicatorProps {
  timestamp: string | Date | null;
  staleAfterMs?: number;
  className?: string;
}

export function FreshnessIndicator({ timestamp, staleAfterMs = 3600_000, className }: FreshnessIndicatorProps) {
  if (!timestamp) {
    return (
      <span className={`font-mono text-[10px] text-status-nodata ${className ?? ""}`}>
        LAST UPDATED: UNKNOWN
      </span>
    );
  }

  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const ageMs = Date.now() - date.getTime();
  const isStale = ageMs > staleAfterMs;

  const label = formatAge(ageMs);

  return (
    <span
      className={`font-mono text-[10px] ${isStale ? "text-status-stale" : "text-status-updated"} ${className ?? ""}`}
    >
      UPDATED {label}
    </span>
  );
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
