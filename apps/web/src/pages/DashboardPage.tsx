import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import type { OpportunityAssessment, Evidence, MarketDemand } from "../lib/api";
import { StatusIndicator } from "../components/ui/StatusIndicator";
import { MetricStripSkeleton, TableSkeleton } from "../components/ui/skeletons";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { UnknownValue, formatPercent } from "../components/ui/UnknownValue";

export function DashboardPage() {
  const [now] = useState(new Date());

  // Real API queries
  const opportunityQuery = useQuery({
    queryKey: queryKeys.opportunity.assessments({ page: 1, limit: 10 }),
    queryFn: () => api.opportunity.assessments({ page: 1, limit: 10 }),
  });

  const evidenceQuery = useQuery({
    queryKey: queryKeys.evidence.list({ page: 1, limit: 5, sortBy: "observedAt", sortOrder: "desc" }),
    queryFn: () => api.evidence.list({ page: 1, limit: 5, sortBy: "observedAt", sortOrder: "desc" }),
  });

  const demandQuery = useQuery({
    queryKey: queryKeys.demand.list({ page: 1, limit: 5 }),
    queryFn: () => api.demand.list({ page: 1, limit: 5 }),
  });

  const assessments = opportunityQuery.data?.data ?? [];
  const evidenceItems = evidenceQuery.data?.data ?? [];
  const demandItems = demandQuery.data?.data ?? [];

  return (
    <div className="h-full overflow-y-auto p-4">
      {/* Header band */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="section-label mb-1">INTELLIGENCE WORKSPACE</p>
          <h1 className="text-lg font-light text-graphite-50">Market Overview</h1>
        </div>
        <StatusIndicator status="live" timestamp={now} />
      </div>

      {/* Stat strips */}
      <div className="mb-4 grid grid-cols-4 gap-px bg-glass-border">
        {opportunityQuery.isLoading ? (
          <>
            <MetricStripSkeleton />
            <MetricStripSkeleton />
            <MetricStripSkeleton />
            <MetricStripSkeleton />
          </>
        ) : (
          <>
            <StatStrip
              label="Assessments"
              value={String(opportunityQuery.data?.pagination?.total ?? 0)}
              change={null}
            />
            <StatStrip
              label="Avg. Opportunity Score"
              value={
                assessments.length > 0
                  ? String(
                      Math.round(
                        assessments.reduce((sum, a) => sum + (a.opportunityScore ?? 0), 0) /
                          assessments.length,
                      ),
                    )
                  : "—"
              }
              change={null}
            />
            <StatStrip
              label="Evidence Items"
              value={String(evidenceQuery.data?.pagination?.total ?? 0)}
              change={null}
            />
            <StatStrip
              label="Demand Signals"
              value={String(demandQuery.data?.pagination?.total ?? 0)}
              change={null}
            />
          </>
        )}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Product Opportunities — 7 cols */}
        <div className="col-span-7 glass-panel">
          <div className="flex items-center justify-between border-b border-glass-border px-3 py-2">
            <span className="section-label">TOP PRODUCT OPPORTUNITIES</span>
            <Link to="/products" className="text-2xs text-accent transition-colors hover:text-accent/80">
              View all →
            </Link>
          </div>

          {opportunityQuery.isLoading && <TableSkeleton rows={5} cols={4} />}

          {opportunityQuery.isError && (
            <ErrorState type="api-failure" onRetry={() => opportunityQuery.refetch()} />
          )}

          {opportunityQuery.isSuccess && assessments.length === 0 && (
            <EmptyState
              title="NO OPPORTUNITIES ASSESSED"
              description="No product opportunities have been assessed yet. Run assessments to see results here."
              action="Run Assessment"
              actionHref="/products"
            />
          )}

          {opportunityQuery.isSuccess && assessments.length > 0 && (
            <div className="divide-y divide-glass-border">
              {/* Table header */}
              <div className="flex items-center px-3 py-1.5 text-2xs font-medium uppercase tracking-wider text-graphite-500">
                <span className="w-44">Product</span>
                <span className="w-24">Score</span>
                <span className="w-24">Confidence</span>
                <span className="w-20">Signals</span>
                <span className="w-20">Risks</span>
                <span className="flex-1">Status</span>
              </div>
              {assessments.map((a: OpportunityAssessment) => (
                <Link
                  key={a.id}
                  to={`/products/${a.productId}`}
                  className="flex items-center px-3 py-2 transition-colors hover:bg-graphite-800/50"
                >
                  <div className="w-44">
                    <p className="truncate text-xs font-medium text-graphite-100">
                      {a.product?.name ?? a.productId.slice(0, 8)}
                    </p>
                    <p className="text-2xs text-graphite-500">
                      {a.product?.brand?.name ?? "Unknown brand"}
                    </p>
                  </div>
                  <span className="w-24 data-value text-xs text-graphite-200">
                    <UnknownValue value={a.opportunityScore} />
                  </span>
                  <span className="w-24 text-xs text-graphite-400">
                    {formatPercent(a.confidence)}
                  </span>
                  <span className="w-20 text-xs text-graphite-300">{a.signalCount}</span>
                  <span className="w-20 text-xs text-graphite-300">{a.riskCount}</span>
                  <span className="flex-1">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                      a.status === "completed"
                        ? "bg-status-live/10 text-status-live"
                        : a.status === "processing"
                        ? "bg-status-changed/10 text-status-changed"
                        : "bg-graphite-800 text-graphite-500"
                    }`}>
                      {a.status}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column — 5 cols */}
        <div className="col-span-5 flex flex-col gap-4">
          {/* Market Demand Signals */}
          <div className="glass-panel">
            <div className="border-b border-glass-border px-3 py-2">
              <span className="section-label">MARKET DEMAND SIGNALS</span>
            </div>

            {demandQuery.isLoading && (
              <div className="space-y-1 p-3">
                <MetricStripSkeleton />
                <MetricStripSkeleton />
                <MetricStripSkeleton />
              </div>
            )}

            {demandQuery.isError && (
              <ErrorState type="api-failure" onRetry={() => demandQuery.refetch()} />
            )}

            {demandQuery.isSuccess && demandItems.length === 0 && (
              <div className="p-4">
                <p className="font-mono text-xs text-graphite-500">No demand signals recorded yet.</p>
              </div>
            )}

            {demandQuery.isSuccess && demandItems.length > 0 && (
              <div className="divide-y divide-glass-border">
                {demandItems.map((d: MarketDemand) => (
                  <div key={d.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={d.trend === "up" ? "text-status-live" : d.trend === "down" ? "text-status-failed" : "text-graphite-500"}>
                        {d.trend === "up" ? "↗" : d.trend === "down" ? "↘" : "→"}
                      </span>
                      <span className="text-xs text-graphite-200">{d.signalType}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-graphite-400">
                        {formatPercent(d.confidence)}
                      </span>
                      <span className="text-2xs text-graphite-500">
                        {d.geography ?? d.country ?? "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Evidence */}
          <div className="glass-panel">
            <div className="border-b border-glass-border px-3 py-2">
              <span className="section-label">LIVE EVIDENCE STREAM</span>
            </div>

            {evidenceQuery.isLoading && (
              <div className="space-y-1 p-3">
                <MetricStripSkeleton />
                <MetricStripSkeleton />
                <MetricStripSkeleton />
              </div>
            )}

            {evidenceQuery.isError && (
              <ErrorState type="api-failure" onRetry={() => evidenceQuery.refetch()} />
            )}

            {evidenceQuery.isSuccess && evidenceItems.length === 0 && (
              <div className="p-4">
                <p className="font-mono text-xs text-graphite-500">No evidence recorded yet.</p>
              </div>
            )}

            {evidenceQuery.isSuccess && evidenceItems.length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2">
                {evidenceItems.map((e: Evidence) => (
                  <EvidenceEvent
                    key={e.id}
                    time={new Date(e.observedAt).toLocaleTimeString("en-US", { hour12: false })}
                    text={`${e.evidenceType} — ${e.entityType}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatStrip({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: string | null;
}) {
  return (
    <div className="bg-glass-DEFAULT p-3">
      <p className="mb-1 text-2xs font-medium uppercase tracking-wider text-graphite-400">{label}</p>
      <p className="data-value text-data-xl text-graphite-50">{value}</p>
      {change && (
        <p className="mt-1 text-2xs text-graphite-500">{change}</p>
      )}
    </div>
  );
}

function EvidenceEvent({ time, text }: { time: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="terminal-text text-graphite-500">{time}</span>
      <span className="text-xs text-graphite-300">{text}</span>
    </div>
  );
}
