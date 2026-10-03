import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { TableSkeleton } from "../components/ui/skeletons";
import { formatPercent, formatValue } from "../components/ui/UnknownValue";

export function LogisticsPage() {
  const assessments = useQuery({ queryKey: queryKeys.logistics.list({ page: 1, limit: 10 }), queryFn: () => api.logistics.list({ page: 1, limit: 10 }) });
  const routes = useQuery({ queryKey: queryKeys.logistics.routes({ page: 1, limit: 20 }), queryFn: () => api.logistics.routes({ page: 1, limit: 20 }) });

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="section-label mb-1">LOGISTICS</p>
      <h1 className="mb-4 text-lg font-light text-graphite-50">Route assessments and logistics network</h1>
      <div className="space-y-4">
        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">ROUTES</span></div>
          {routes.isLoading && <TableSkeleton rows={5} cols={4} />}
          {routes.isError && <ErrorState onRetry={() => routes.refetch()} />}
          {routes.isSuccess && (!routes.data?.data || routes.data.data.length === 0) && <EmptyState title="NO ROUTES" description="No logistics routes have been mapped." />}
          {routes.isSuccess && routes.data?.data && routes.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {routes.data.data.map((r) => (
                <div key={r.id} className="flex items-center px-3 py-2">
                  <span className="flex-1 text-xs text-graphite-200">{r.originName ?? "?"} → {r.destinationName ?? "?"}</span>
                  <span className="w-20 text-xs text-graphite-400">{formatValue(r.riskScore)} risk</span>
                  <span className="w-20 text-xs text-graphite-400">{formatPercent(r.confidence)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">ASSESSMENTS</span></div>
          {assessments.isLoading && <TableSkeleton rows={3} cols={3} />}
          {assessments.isSuccess && (!assessments.data?.data || assessments.data.data.length === 0) && <EmptyState title="NO ASSESSMENTS" description="No logistics assessments." />}
          {assessments.isSuccess && assessments.data?.data && assessments.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {assessments.data.data.map((a) => (
                <div key={a.id} className="flex items-center px-3 py-2">
                  <span className="w-20 text-xs text-graphite-300">{a.subjectType}</span>
                  <span className="w-20 data-value text-xs">{formatValue(a.overallScore)}</span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${a.status === "completed" ? "bg-status-live/10 text-status-live" : "bg-graphite-800 text-graphite-500"}`}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
