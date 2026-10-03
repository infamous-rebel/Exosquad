/**
 * Renders a placeholder for unknown/missing/unavailable values.
 * Never renders 0 for missing data — always a descriptive label.
 */

interface UnknownValueProps {
  value: unknown;
  fallback?: string;
  className?: string;
}

const FALLBACKS = {
  unknown: "Unknown",
  unavailable: "Not available",
  pending: "Pending",
  stale: "Stale",
  conflicting: "Conflicting",
} as const;

export function UnknownValue({ value, fallback = "Unknown", className }: UnknownValueProps) {
  if (value === null || value === undefined || value === "") {
    return (
      <span className={`font-mono text-graphite-500 italic ${className ?? ""}`}>
        {fallback}
      </span>
    );
  }
  return <span className={className}>{value as React.ReactNode}</span>;
}

/** Format a number that may be null — returns formatted string or fallback. */
export function formatValue(value: number | null | undefined, fallback = "Unknown"): string {
  if (value === null || value === undefined) return fallback;
  return value.toLocaleString();
}

/** Format a percentage that may be null — returns formatted string or fallback. */
export function formatPercent(value: number | null | undefined, decimals = 1, fallback = "Unknown"): string {
  if (value === null || value === undefined) return fallback;
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Format a confidence score (0-1) for display. */
export function formatConfidence(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unknown";
  if (value >= 0.8) return `High (${(value * 100).toFixed(0)}%)`;
  if (value >= 0.5) return `Medium (${(value * 100).toFixed(0)}%)`;
  return `Low (${(value * 100).toFixed(0)}%)`;
}

export { FALLBACKS };
