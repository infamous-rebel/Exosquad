import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { TableSkeleton } from "../components/ui/skeletons";
import { formatPercent, formatValue } from "../components/ui/UnknownValue";

export function SourcingPage() {
  const assessments = useQuery({ queryKey: queryKeys.sourcing.assessments({ page: 1, limit: 10 }), queryFn: () => api.sourcing.assessments({ page: 1, limit: 10 }) });

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="section-label mb-1">SOURCING INTELLIGENCE</p>
      <h1 className="mb-4 text-lg font-light text-graphite-50">Supplier assessments and sourcing viability</h1>
      <div className="glass-panel">
        <div className="border-b border-glass-border px-3 py-2"><span className="section-label">ASSESSMENTS</span></div>
        {assessments.isLoading && <TableSkeleton rows={3} cols={4} />}
        {assessments.isError && <ErrorState onRetry={() => assessments.refetch()} />}
        {assessments.isSuccess && (!assessments.data?.data || assessments.data.data.length === 0) && <EmptyState title="NO ASSESSMENTS" description="No sourcing assessments have been run." />}
        {assessments.isSuccess && assessments.data?.data && assessments.data.data.length > 0 && (
          <div className="divide-y divide-glass-border">
            {assessments.data.data.map((a) => (
              <div key={a.id} className="flex items-center px-3 py-2">
                <span className="w-20 text-xs text-graphite-300">{a.productId.slice(0, 8)}</span>
                <span className="w-20 data-value text-xs">{formatValue(a.overallScore)}</span>
                <span className="w-20 text-xs text-graphite-400">{formatPercent(a.confidence)}</span>
                <span className="w-20 text-xs text-graphite-400">{a.supplierCount} suppliers</span>
                <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${a.status === "completed" ? "bg-status-live/10 text-status-live" : "bg-graphite-800 text-graphite-500"}`}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
