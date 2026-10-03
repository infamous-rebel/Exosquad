import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { TableSkeleton } from "../components/ui/skeletons";
import { formatPercent, formatValue } from "../components/ui/UnknownValue";

export function DemandPage() {
  const signals = useQuery({ queryKey: queryKeys.signals.list({ page: 1, limit: 20 }), queryFn: () => api.signals.list({ page: 1, limit: 20 }) });

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="section-label mb-1">DEMAND INTELLIGENCE</p>
      <h1 className="mb-4 text-lg font-light text-graphite-50">Global demand signal tracking</h1>

      <div className="glass-panel">
        <div className="border-b border-glass-border px-3 py-2"><span className="section-label">ALL SIGNALS</span></div>
        {signals.isLoading && <TableSkeleton rows={5} cols={5} />}
        {signals.isError && <ErrorState onRetry={() => signals.refetch()} />}
        {signals.isSuccess && (!signals.data?.data || signals.data.data.length === 0) && (
          <EmptyState title="NO SIGNALS" description="No demand signals have been recorded yet." />
        )}
        {signals.isSuccess && signals.data?.data && signals.data.data.length > 0 && (
          <div className="divide-y divide-glass-border">
            <div className="flex items-center px-3 py-1.5 text-2xs font-medium uppercase tracking-wider text-graphite-500">
              <span className="w-28">Type</span><span className="w-28">Metric</span><span className="w-20">Value</span><span className="w-20">Confidence</span><span className="flex-1">Observed</span>
            </div>
            {signals.data.data.map((s) => (
              <div key={s.id} className="flex items-center px-3 py-2">
                <span className="w-28 text-xs text-graphite-300">{s.signalType}</span>
                <span className="w-28 text-xs text-graphite-400">{s.metric}</span>
                <span className="w-20 data-value text-xs">{formatValue(s.value)}</span>
                <span className="w-20 text-xs text-graphite-400">{formatPercent(s.confidence)}</span>
                <span className="flex-1 text-xs text-graphite-500">{s.observedAt ? new Date(s.observedAt).toLocaleDateString() : "Unknown"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
