import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { TableSkeleton } from "../components/ui/skeletons";
import { EvidenceBadge } from "../components/evidence/EvidenceBadge";
import { formatPercent } from "../components/ui/UnknownValue";

export function EvidencePage() {
  const evidence = useQuery({ queryKey: queryKeys.evidence.list({ page: 1, limit: 30 }), queryFn: () => api.evidence.list({ page: 1, limit: 30 }) });
  const conflicts = useQuery({ queryKey: queryKeys.evidence.conflicts({ page: 1, limit: 10 }), queryFn: () => api.evidence.conflicts({ page: 1, limit: 10 }) });

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="section-label mb-1">EVIDENCE</p>
      <h1 className="mb-4 text-lg font-light text-graphite-50">Evidence chain, claims, and conflicts</h1>
      <div className="space-y-4">
        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">EVIDENCE</span></div>
          {evidence.isLoading && <TableSkeleton rows={5} cols={5} />}
          {evidence.isError && <ErrorState onRetry={() => evidence.refetch()} />}
          {evidence.isSuccess && (!evidence.data?.data || evidence.data.data.length === 0) && <EmptyState title="NO EVIDENCE" description="No evidence has been recorded." />}
          {evidence.isSuccess && evidence.data?.data && evidence.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {evidence.data.data.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2">
                  <EvidenceBadge status={e.status} />
                  <span className="w-24 text-xs text-graphite-300">{e.evidenceType}</span>
                  <span className="w-20 text-xs text-graphite-400">{e.entityType}</span>
                  <span className="flex-1 truncate text-xs text-graphite-400">{e.observedValue ?? "—"}</span>
                  <span className="w-16 text-xs text-graphite-500">{formatPercent(e.confidence)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">CONFLICTS</span></div>
          {conflicts.isLoading && <TableSkeleton rows={2} cols={3} />}
          {conflicts.isSuccess && (!conflicts.data?.data || conflicts.data.data.length === 0) && <div className="p-4"><p className="font-mono text-xs text-graphite-500">No conflicts detected.</p></div>}
          {conflicts.isSuccess && conflicts.data?.data && conflicts.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {conflicts.data.data.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${c.severity === "high" ? "bg-status-failed/10 text-status-failed" : "bg-status-stale/10 text-status-stale"}`}>{c.severity}</span>
                  <span className="flex-1 text-xs text-graphite-300">{c.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
