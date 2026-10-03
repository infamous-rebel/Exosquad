/**
 * Differentiated error display: no evidence / no results / permission denied /
 * API failure / stale / partial.
 */

interface ErrorStateProps {
  type?: "no-evidence" | "no-results" | "permission-denied" | "api-failure" | "stale" | "partial";
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

const DEFAULTS: Record<string, { title: string; message: string }> = {
  "no-evidence": {
    title: "NO EVIDENCE",
    message: "No evidence has been recorded for this entity yet. Configure sources to begin collecting data.",
  },
  "no-results": {
    title: "NO RESULTS",
    message: "The query returned no matching results. Try adjusting filters.",
  },
  "permission-denied": {
    title: "ACCESS DENIED",
    message: "You do not have permission to view this resource. Contact your tenant administrator.",
  },
  "api-failure": {
    title: "SYSTEM ERROR",
    message: "Failed to retrieve data from the intelligence backend. The system may be temporarily unavailable.",
  },
  stale: {
    title: "STALE DATA",
    message: "The data shown may be outdated. A refresh is recommended.",
  },
  partial: {
    title: "PARTIAL DATA",
    message: "Some data could not be loaded. Available data is shown; missing sections are marked.",
  },
};

export function ErrorState({ type = "api-failure", title, message, onRetry, className }: ErrorStateProps) {
  const defaults = DEFAULTS[type] ?? DEFAULTS["api-failure"]!;

  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className ?? ""}`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-status-failed/10 ring-1 ring-status-failed/30">
        <svg className="h-5 w-5 text-status-failed" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="section-label mb-2 text-status-failed">{title ?? defaults.title}</p>
      <p className="max-w-sm font-mono text-xs text-graphite-500">{message ?? defaults.message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded bg-graphite-800 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-graphite-300 ring-1 ring-graphite-700 transition hover:bg-graphite-700"
        >
          Retry
        </button>
      )}
    </div>
  );
}
