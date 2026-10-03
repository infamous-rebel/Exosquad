import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { TableSkeleton } from "../components/ui/skeletons";
import { formatPercent } from "../components/ui/UnknownValue";

export function SupplyPage() {
  const assessments = useQuery({ queryKey: queryKeys.supplyChain.list({ page: 1, limit: 10 }), queryFn: () => api.supplyChain.list({ page: 1, limit: 10 }) });
  const relationships = useQuery({ queryKey: queryKeys.supplyChain.relationships({ page: 1, limit: 20 }), queryFn: () => api.supplyChain.relationships({ page: 1, limit: 20 }) });

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="section-label mb-1">SUPPLY NETWORK</p>
      <h1 className="mb-4 text-lg font-light text-graphite-50">Supply chain topology and assessments</h1>

      <div className="space-y-4">
        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">ASSESSMENTS</span></div>
          {assessments.isLoading && <TableSkeleton rows={3} cols={4} />}
          {assessments.isError && <ErrorState onRetry={() => assessments.refetch()} />}
          {assessments.isSuccess && (!assessments.data?.data || assessments.data.data.length === 0) && <EmptyState title="NO ASSESSMENTS" description="No supply chain assessments have been run." />}
          {assessments.isSuccess && assessments.data?.data && assessments.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {assessments.data.data.map((a) => (
                <div key={a.id} className="flex items-center px-3 py-2">
                  <span className="w-28 text-xs text-graphite-300">{a.subjectType}</span>
                  <span className="w-20 data-value text-xs">{a.overallScore ?? "—"}</span>
                  <span className="w-20 text-xs text-graphite-400">{formatPercent(a.confidence)}</span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${a.status === "completed" ? "bg-status-live/10 text-status-live" : "bg-graphite-800 text-graphite-500"}`}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">RELATIONSHIPS</span></div>
          {relationships.isLoading && <TableSkeleton rows={5} cols={4} />}
          {relationships.isSuccess && (!relationships.data?.data || relationships.data.data.length === 0) && <EmptyState title="NO RELATIONSHIPS" description="No supply chain relationships mapped." />}
          {relationships.isSuccess && relationships.data?.data && relationships.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {relationships.data.data.map((r) => (
                <div key={r.id} className="flex items-center px-3 py-2">
                  <span className="w-24 text-xs text-graphite-300">{r.nodeType}</span>
                  <span className="w-24 text-xs text-graphite-400">{r.edgeType}</span>
                  <span className="w-20 text-xs text-graphite-400">{r.country ?? "—"}</span>
                  <span className="text-xs text-graphite-400">{formatPercent(r.confidence)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
