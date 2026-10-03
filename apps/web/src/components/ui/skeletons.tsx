/**
 * Skeleton loaders for various content areas.
 */

export function MetricStripSkeleton() {
  return (
    <div className="data-strip flex items-center gap-3 px-3 py-2">
      <div className="h-3 w-20 animate-pulse rounded bg-graphite-800" />
      <div className="ml-auto h-3 w-12 animate-pulse rounded bg-graphite-800" />
    </div>
  );
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="glass-panel flex items-center justify-center p-4" style={{ minHeight: height }}>
      <div className="flex w-full flex-col gap-3">
        <div className="h-3 w-24 animate-pulse rounded bg-graphite-800" />
        <div className="flex-1">
          <svg width="100%" height={height - 40} className="opacity-20">
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" className="text-graphite-700" strokeDasharray="4 4" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass-panel overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 border-b border-graphite-800 px-4 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 flex-1 animate-pulse rounded bg-graphite-800" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-4 border-b border-graphite-800/50 px-4 py-3">
          {Array.from({ length: cols }).map((_, ci) => (
            <div key={ci} className="h-3 flex-1 animate-pulse rounded bg-graphite-800/60" style={{ animationDelay: `${ri * 100 + ci * 50}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-3 w-3 animate-pulse rounded-full bg-graphite-800" />
      <div className="h-3 flex-1 animate-pulse rounded bg-graphite-800" />
      <div className="h-3 w-16 animate-pulse rounded bg-graphite-800" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass-panel space-y-3 p-4">
      <div className="h-3 w-24 animate-pulse rounded bg-graphite-800" />
      <div className="h-8 w-16 animate-pulse rounded bg-graphite-800" />
      <div className="h-2 w-full animate-pulse rounded bg-graphite-800/50" />
    </div>
  );
}
