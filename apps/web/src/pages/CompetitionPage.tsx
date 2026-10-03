import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { TableSkeleton } from "../components/ui/skeletons";
import { formatPercent } from "../components/ui/UnknownValue";

export function CompetitionPage() {
  const competitors = useQuery({
    queryKey: queryKeys.opportunity.competitors(""),
    queryFn: () => api.opportunity.competitors(""),
  });

  const rawData = competitors.data;
  const items: any[] = rawData
    ? Array.isArray(rawData)
      ? rawData
      : (rawData as { data?: any[] })?.data ?? []
    : [];

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="section-label mb-1">COMPETITION</p>
      <h1 className="mb-4 text-lg font-light text-graphite-50">Competitive landscape analysis</h1>
      <div className="glass-panel">
        <div className="border-b border-glass-border px-3 py-2"><span className="section-label">COMPETITORS</span></div>
        {competitors.isLoading && <TableSkeleton rows={5} cols={4} />}
        {competitors.isError && <ErrorState onRetry={() => competitors.refetch()} />}
        {competitors.isSuccess && items.length === 0 && (
          <EmptyState title="NO COMPETITORS" description="No competitor data available." />
        )}
        {competitors.isSuccess && items.length > 0 && (
          <div className="divide-y divide-glass-border">
            {items.map((c: any) => (
              <div key={c.id} className="flex items-center px-3 py-2">
                <span className="w-36 text-xs font-medium text-graphite-200">{c.competitorName}</span>
                <span className="w-28 text-xs text-graphite-400">{c.competitorBrand ?? "Unknown"}</span>
                <span className="w-28 text-xs text-graphite-400">{c.marketPosition ?? "Unknown"}</span>
                <span className="text-xs text-graphite-400">{formatPercent(c.confidence)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
