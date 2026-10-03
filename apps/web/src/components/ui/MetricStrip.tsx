/**
 * Dense horizontal metric strip: label, value, change indicator, optional sparkline.
 */

import { Sparkline } from "./Sparkline";

interface MetricStripProps {
  label: string;
  value: string | number | null;
  unit?: string;
  change?: number | null;
  changeLabel?: string;
  sparklineData?: number[];
  status?: "live" | "updated" | "changed" | "stale" | "failed" | "nodata";
  className?: string;
}

const STATUS_DOT: Record<string, string> = {
  live: "status-dot-live",
  updated: "status-dot-updated",
  changed: "status-dot-changed",
  stale: "status-dot-stale",
  failed: "status-dot-failed",
  nodata: "status-dot-nodata",
};

export function MetricStrip({
  label,
  value,
  unit,
  change,
  changeLabel,
  sparklineData,
  status,
  className = "",
}: MetricStripProps) {
  const displayValue = value === null || value === undefined ? "—" : String(value);

  return (
    <div className={`data-strip flex items-center gap-3 px-3 py-2 ${className}`}>
      {status && <span className={`status-dot ${STATUS_DOT[status]}`} />}
      <span className="terminal-text min-w-0 flex-1 truncate text-graphite-400">{label}</span>
      <span className="data-value whitespace-nowrap text-graphite-100">
        {displayValue}
        {unit && <span className="ml-0.5 text-graphite-500">{unit}</span>}
      </span>
      {change !== undefined && change !== null && (
        <span
          className={`data-value whitespace-nowrap text-xs ${
            change > 0 ? "text-status-live" : change < 0 ? "text-status-failed" : "text-graphite-500"
          }`}
        >
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}
          {changeLabel && <span className="ml-0.5 text-graphite-600">{changeLabel}</span>}
        </span>
      )}
      {sparklineData && sparklineData.length > 1 && (
        <Sparkline data={sparklineData} width={60} height={16} />
      )}
    </div>
  );
}
