import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { TableSkeleton } from "../components/ui/skeletons";

export function OutreachPage() {
  const campaigns = useQuery({ queryKey: queryKeys.outreach.campaigns({ page: 1, limit: 20 }), queryFn: () => api.outreach.campaigns({ page: 1, limit: 20 }) });
  const outreachs = useQuery({ queryKey: queryKeys.outreach.outreachs({ page: 1, limit: 20 }), queryFn: () => api.outreach.outreachs({ page: 1, limit: 20 }) });

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="section-label mb-1">OUTREACH</p>
      <h1 className="mb-4 text-lg font-light text-graphite-50">Supplier outreach campaigns and communications</h1>
      <div className="space-y-4">
        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">CAMPAIGNS</span></div>
          {campaigns.isLoading && <TableSkeleton rows={3} cols={3} />}
          {campaigns.isError && <ErrorState onRetry={() => campaigns.refetch()} />}
          {campaigns.isSuccess && (!campaigns.data?.data || campaigns.data.data.length === 0) && <EmptyState title="NO CAMPAIGNS" description="No outreach campaigns created." />}
          {campaigns.isSuccess && campaigns.data?.data && campaigns.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {campaigns.data.data.map((c) => (
                <div key={c.id} className="flex items-center px-3 py-2">
                  <span className="flex-1 text-xs font-medium text-graphite-200">{c.name}</span>
                  <span className={`w-20 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${c.status === "active" ? "bg-status-live/10 text-status-live" : "bg-graphite-800 text-graphite-500"}`}>{c.status}</span>
                  <span className="w-24 text-xs text-graphite-400">{c.outreachCount} outreachs</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">OUTREACHS</span></div>
          {outreachs.isLoading && <TableSkeleton rows={3} cols={3} />}
          {outreachs.isSuccess && (!outreachs.data?.data || outreachs.data.data.length === 0) && <EmptyState title="NO OUTREACHS" description="No outreachs initiated." />}
          {outreachs.isSuccess && outreachs.data?.data && outreachs.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {outreachs.data.data.map((o) => (
                <div key={o.id} className="flex items-center px-3 py-2">
                  <span className="flex-1 text-xs text-graphite-200">{o.supplierName ?? o.supplierId ?? "Unknown supplier"}</span>
                  <span className={`w-20 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${o.status === "sent" ? "bg-status-live/10 text-status-live" : o.status === "responded" ? "bg-accent/10 text-accent" : "bg-graphite-800 text-graphite-500"}`}>{o.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
