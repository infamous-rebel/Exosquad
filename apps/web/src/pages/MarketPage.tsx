import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { TableSkeleton } from "../components/ui/skeletons";
import { UnknownValue, formatPercent } from "../components/ui/UnknownValue";

export function MarketPage() {
  const demand = useQuery({ queryKey: queryKeys.demand.list({ page: 1, limit: 20 }), queryFn: () => api.demand.list({ page: 1, limit: 20 }) });
  const assessments = useQuery({ queryKey: queryKeys.opportunity.assessments({ page: 1, limit: 10 }), queryFn: () => api.opportunity.assessments({ page: 1, limit: 10 }) });

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="section-label mb-1">MARKET INTELLIGENCE</p>
      <h1 className="mb-4 text-lg font-light text-graphite-50">Market-wide demand and opportunity overview</h1>

      <div className="grid grid-cols-2 gap-4">
        {/* Demand signals */}
        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">MARKET DEMAND</span></div>
          {demand.isLoading && <TableSkeleton rows={5} cols={4} />}
          {demand.isError && <ErrorState onRetry={() => demand.refetch()} />}
          {demand.isSuccess && (!demand.data?.data || demand.data.data.length === 0) && <EmptyState title="NO DATA" description="No market demand signals available." />}
          {demand.isSuccess && demand.data?.data && demand.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {demand.data.data.map((d) => (
                <div key={d.id} className="flex items-center px-3 py-2">
                  <span className="w-28 text-xs text-graphite-300">{d.signalType}</span>
                  <span className="w-20 text-xs text-graphite-400">{d.trend ?? "Unknown"}</span>
                  <span className="w-20 text-xs text-graphite-400">{formatPercent(d.confidence)}</span>
                  <span className="flex-1 text-xs text-graphite-500">{d.geography ?? d.country ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Opportunity assessments */}
        <div className="glass-panel">
          <div className="border-b border-glass-border px-3 py-2"><span className="section-label">OPPORTUNITIES</span></div>
          {assessments.isLoading && <TableSkeleton rows={5} cols={3} />}
          {assessments.isError && <ErrorState onRetry={() => assessments.refetch()} />}
          {assessments.isSuccess && (!assessments.data?.data || assessments.data.data.length === 0) && <EmptyState title="NO ASSESSMENTS" description="No opportunity assessments yet." />}
          {assessments.isSuccess && assessments.data?.data && assessments.data.data.length > 0 && (
            <div className="divide-y divide-glass-border">
              {assessments.data.data.map((a) => (
                <Link key={a.id} to={`/products/${a.productId}`} className="flex items-center px-3 py-2 hover:bg-graphite-800/30">
                  <span className="flex-1 text-xs text-graphite-200">{a.product?.name ?? a.productId.slice(0, 8)}</span>
                  <span className="w-20 data-value text-xs">{UnknownValue({ value: a.opportunityScore })}</span>
                  <span className="w-20 text-xs text-graphite-400">{formatPercent(a.confidence)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
