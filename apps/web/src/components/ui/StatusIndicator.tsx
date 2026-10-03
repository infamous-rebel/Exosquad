interface StatusIndicatorProps {
  status: "live" | "updated" | "changed" | "stale" | "failed" | "nodata";
  timestamp: Date;
}

const STATUS_CONFIG = {
  live: { dotClass: "status-dot-live", label: "LIVE", color: "text-status-live" },
  updated: { dotClass: "status-dot-updated", label: "UPDATED", color: "text-status-updated" },
  changed: { dotClass: "status-dot-changed", label: "CHANGED", color: "text-status-changed" },
  stale: { dotClass: "status-dot-stale", label: "STALE", color: "text-status-stale" },
  failed: { dotClass: "status-dot-failed", label: "FAILED", color: "text-status-failed" },
  nodata: { dotClass: "status-dot-nodata", label: "NO DATA", color: "text-status-nodata" },
};

export function StatusIndicator({ status, timestamp }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const timeStr = timestamp.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex items-center gap-1.5">
      <span className={`status-dot ${config.dotClass}`} />
      <span className={`terminal-text ${config.color}`}>{config.label}</span>
      <span className="terminal-text text-graphite-500">{timeStr}</span>
    </div>
  );
}
