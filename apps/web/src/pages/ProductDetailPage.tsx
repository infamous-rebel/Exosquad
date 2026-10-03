import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { formatPercent, formatValue } from "../components/ui/UnknownValue";
import { FreshnessIndicator } from "../components/ui/FreshnessIndicator";
import { MetricStrip } from "../components/ui/MetricStrip";
import { TimeSeriesChart } from "../components/ui/charts/TimeSeriesChart";
import { CostBreakdown } from "../components/ui/charts/CostBreakdown";
import { RiskPanel } from "../components/risk/RiskPanel";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { CardSkeleton, TableSkeleton } from "../components/ui/skeletons";
import { EvidenceBadge } from "../components/evidence/EvidenceBadge";

const TABS = [
  "OVERVIEW", "DEMAND", "COMPETITION", "SUPPLIERS", "SOURCING",
  "LOGISTICS", "ECONOMICS", "RISKS", "RESEARCH", "OUTREACH", "EVIDENCE",
] as const;

type Tab = (typeof TABS)[number];

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("OVERVIEW");

  if (!productId) return <div className="p-8 text-center text-graphite-500">No product ID</div>;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <ProductHeader productId={productId} />

      {/* Tabs */}
      <div className="sticky top-0 z-10 flex border-b border-glass-border bg-graphite-950/90 px-4 backdrop-blur-xs">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? "border-b-2 border-accent text-accent"
                : "text-graphite-500 hover:text-graphite-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === "OVERVIEW" && <OverviewTab productId={productId} />}
        {activeTab === "DEMAND" && <DemandTab productId={productId} />}
        {activeTab === "COMPETITION" && <CompetitionTab productId={productId} />}
        {activeTab === "SUPPLIERS" && <SuppliersTab productId={productId} />}
        {activeTab === "SOURCING" && <SourcingTab productId={productId} />}
        {activeTab === "LOGISTICS" && <LogisticsTab productId={productId} />}
        {activeTab === "ECONOMICS" && <EconomicsTab productId={productId} />}
        {activeTab === "RISKS" && <RisksTab productId={productId} />}
        {activeTab === "RESEARCH" && <ResearchTab productId={productId} />}
        {activeTab === "OUTREACH" && <OutreachTab productId={productId} />}
        {activeTab === "EVIDENCE" && <EvidenceTab productId={productId} />}
      </div>
    </div>
  );
}

// ─── Product Header ──────────────────────────────────────────────────────────

function ProductHeader({ productId }: { productId: string }) {
  const { data: product, isLoading, isError } = useQuery({
    queryKey: queryKeys.products.detail(productId),
    queryFn: () => api.products.get(productId),
  });

  return (
    <div className="border-b border-glass-border px-4 py-3">
      <Breadcrumbs
        items={[
          { label: "PRODUCTS", href: "/products" },
          { label: product?.name ?? productId.slice(0, 8) },
        ]}
      />
      {isLoading && <div className="mt-2 h-5 w-48 animate-pulse rounded bg-graphite-800" />}
      {isError && <p className="mt-2 font-mono text-xs text-status-failed">Failed to load product</p>}
      {product && (
        <div className="mt-2 flex items-center gap-4">
          <h1 className="text-lg font-light text-graphite-50">{product.name}</h1>
          <span className="rounded-2xs border border-graphite-600 px-1.5 py-0.5 text-2xs text-graphite-400">
            {product.brand?.name}
          </span>
          <span className="rounded-2xs border border-graphite-600 px-1.5 py-0.5 text-2xs text-graphite-400">
            {product.category?.name}
          </span>
          <FreshnessIndicator timestamp={product.updatedAt} />
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ productId }: { productId: string }) {
  const demand = useQuery({
    queryKey: queryKeys.products.demand(productId),
    queryFn: () => api.products.demand(productId),
  });
  const trends = useQuery({
    queryKey: queryKeys.products.trends(productId),
    queryFn: () => api.products.trends(productId),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-px bg-glass-border">
        {demand.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <MetricStrip label="DEMAND SCORE" value={formatValue(demand.data?.demandScore)} />
            <MetricStrip label="CONFIDENCE" value={formatPercent(demand.data?.confidence)} />
            <MetricStrip label="GROWTH" value={trends.data?.growth !== null && trends.data?.growth !== undefined ? `${(trends.data.growth * 100).toFixed(1)}%` : "Unknown"} />
            <MetricStrip label="TREND" value={trends.data?.trend ?? "Unknown"} />
          </>
        )}
      </div>

      {demand.isError && <ErrorState type="api-failure" onRetry={() => demand.refetch()} />}
      {demand.isSuccess && !demand.data && (
        <EmptyState title="NOT YET CALCULATED" description="Demand has not been computed for this product yet." />
      )}
    </div>
  );
}

// ─── Demand Tab ──────────────────────────────────────────────────────────────

function DemandTab({ productId }: { productId: string }) {
  const demand = useQuery({
    queryKey: queryKeys.products.demand(productId),
    queryFn: () => api.products.demand(productId),
  });
  const history = useQuery({
    queryKey: queryKeys.products.demandHistory(productId),
    queryFn: () => api.products.demandHistory(productId),
  });
  const signals = useQuery({
    queryKey: queryKeys.products.signals(productId, { page: 1, limit: 10 }),
    queryFn: () => api.products.signals(productId, { page: 1, limit: 10 }),
  });
  const trends = useQuery({
    queryKey: queryKeys.products.trends(productId),
    queryFn: () => api.products.trends(productId),
  });

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid grid-cols-4 gap-px bg-glass-border">
        {demand.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <MetricStrip label="DEMAND SCORE" value={formatValue(demand.data?.demandScore)} />
            <MetricStrip label="SAMPLE SIZE" value={formatValue(demand.data?.sampleSize)} />
            <MetricStrip label="CONFIDENCE" value={formatPercent(demand.data?.confidence)} />
            <MetricStrip label="WINDOW" value={demand.data?.window ?? "Unknown"} />
          </>
        )}
      </div>

      {/* Trend chart */}
      {history.isLoading && <CardSkeleton />}
      {history.isSuccess && history.data && history.data.length > 0 && (
        <TimeSeriesChart
          data={history.data.map((d) => ({ date: d.date, value: d.value }))}
          label="DEMAND HISTORY"
          color="#4fc3f7"
        />
      )}

      {/* Trends */}
      {trends.isSuccess && trends.data && (
        <div className="grid grid-cols-4 gap-px bg-glass-border">
          <MetricStrip label="TREND" value={trends.data.trend ?? "Unknown"} />
          <MetricStrip label="GROWTH" value={trends.data.growth !== null ? `${(trends.data.growth * 100).toFixed(1)}%` : "Unknown"} />
          <MetricStrip label="ACCELERATION" value={trends.data.acceleration !== null ? trends.data.acceleration.toFixed(3) : "Unknown"} />
          <MetricStrip label="MOMENTUM" value={trends.data.momentum !== null ? trends.data.momentum.toFixed(3) : "Unknown"} />
        </div>
      )}

      {/* Signals table */}
      <div className="glass-panel">
        <div className="border-b border-glass-border px-3 py-2">
          <span className="section-label">DEMAND SIGNALS</span>
        </div>
        {signals.isLoading && <TableSkeleton rows={3} cols={5} />}
        {signals.isSuccess && (!signals.data?.data || signals.data.data.length === 0) && (
          <EmptyState title="NO SIGNALS" description="No demand signals recorded yet. Configure sources to begin tracking." />
        )}
        {signals.isSuccess && signals.data?.data && signals.data.data.length > 0 && (
          <div className="divide-y divide-glass-border">
            <div className="flex items-center px-3 py-1.5 text-2xs font-medium uppercase tracking-wider text-graphite-500">
              <span className="w-28">Type</span>
              <span className="w-28">Metric</span>
              <span className="w-20">Value</span>
              <span className="w-20">Confidence</span>
              <span className="flex-1">Observed</span>
            </div>
            {signals.data.data.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center px-3 py-2">
                <span className="w-28 text-xs text-graphite-300">{s.signalType}</span>
                <span className="w-28 text-xs text-graphite-400">{s.metric}</span>
                <span className="w-20 data-value text-xs text-graphite-200">{formatValue(s.value)}</span>
                <span className="w-20 text-xs text-graphite-400">{formatPercent(s.confidence)}</span>
                <span className="flex-1 text-xs text-graphite-500">
                  {s.observedAt ? new Date(s.observedAt).toLocaleDateString() : "Unknown"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Competition Tab ─────────────────────────────────────────────────────────

function CompetitionTab({ productId }: { productId: string }) {
  const competitors = useQuery({
    queryKey: queryKeys.opportunity.competitors(productId),
    queryFn: () => api.opportunity.competitors(productId),
  });

  const rawData = competitors.data;
  const items: any[] = rawData
    ? Array.isArray(rawData)
      ? rawData
      : (rawData as { data?: any[] })?.data ?? []
    : [];

  return (
    <div className="space-y-4">
      <div className="glass-panel">
        <div className="border-b border-glass-border px-3 py-2">
          <span className="section-label">COMPETITORS</span>
        </div>
        {competitors.isLoading && <TableSkeleton rows={3} cols={4} />}
        {competitors.isSuccess && items.length === 0 && (
          <EmptyState title="NO COMPETITORS" description="No competitor data available for this product." />
        )}
        {competitors.isSuccess && items.length > 0 && (
          <div className="divide-y divide-glass-border">
            {items.map((c: any) => (
              <div key={c.id} className="flex items-center px-3 py-2">
                <span className="w-40 text-xs font-medium text-graphite-200">{c.competitorName}</span>
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

// ─── Suppliers Tab ───────────────────────────────────────────────────────────

function SuppliersTab({ productId }: { productId: string }) {
  const suppliers = useQuery({
    queryKey: queryKeys.sourcing.productSuppliers(productId),
    queryFn: () => api.sourcing.productSuppliers(productId),
  });

  return (
    <div className="glass-panel">
      <div className="border-b border-glass-border px-3 py-2">
        <span className="section-label">SUPPLIER ASSESSMENTS</span>
      </div>
      {suppliers.isLoading && <TableSkeleton rows={3} cols={5} />}
      {suppliers.isSuccess && (!suppliers.data || suppliers.data.length === 0) && (
        <EmptyState title="NO SUPPLIERS" description="No supplier assessments found for this product." />
      )}
      {suppliers.isSuccess && suppliers.data && suppliers.data.length > 0 && (
        <div className="divide-y divide-glass-border">
          {suppliers.data.map((s) => (
            <div key={s.id} className="flex items-center px-3 py-2">
              <span className="w-36 text-xs font-medium text-graphite-200">{s.supplierName}</span>
              <span className="w-20 data-value text-xs">{formatValue(s.overallScore)}</span>
              <span className="w-20 text-xs text-graphite-400">{formatValue(s.unitPrice)} {s.currency}</span>
              <span className="w-20 text-xs text-graphite-400">{formatValue(s.moq)} MOQ</span>
              <span className="text-xs text-graphite-400">{s.country ?? "Unknown"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sourcing Tab ────────────────────────────────────────────────────────────

function SourcingTab({ productId }: { productId: string }) {
  const viability = useQuery({
    queryKey: queryKeys.sourcing.viability(productId),
    queryFn: () => api.sourcing.viability(productId),
  });
  const constraints = useQuery({
    queryKey: queryKeys.sourcing.constraints(productId),
    queryFn: () => api.sourcing.constraints(productId),
  });

  return (
    <div className="space-y-4">
      {/* Viability */}
      <div className="grid grid-cols-4 gap-px bg-glass-border">
        {viability.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : viability.data ? (
          <>
            <MetricStrip label="VIABILITY SCORE" value={formatValue(viability.data.viabilityScore)} />
            <MetricStrip label="CONSTRAINT LEVEL" value={viability.data.constraintLevel ?? "Unknown"} />
            <MetricStrip label="ALTERNATIVES" value={formatValue(viability.data.alternatives)} />
            <MetricStrip label="AVG LEAD TIME" value={formatValue(viability.data.leadTimeAvg, "Unknown")} unit="days" />
          </>
        ) : (
          <div className="col-span-4 bg-glass-DEFAULT p-4">
            <EmptyState title="NOT ASSESSED" description="Sourcing viability has not been calculated yet." />
          </div>
        )}
      </div>

      {/* Constraints */}
      {constraints.isSuccess && constraints.data?.constraints && constraints.data.constraints.length > 0 && (
        <div className="glass-panel p-4">
          <p className="section-label mb-3">CONSTRAINTS</p>
          {constraints.data.constraints.map((c, i) => (
            <div key={i} className="mb-2 rounded bg-graphite-900/50 p-2 ring-1 ring-graphite-800">
              <span className="font-mono text-[10px] uppercase text-status-stale">{c.severity}</span>
              <span className="ml-2 text-xs text-graphite-300">{c.type}</span>
              <p className="mt-1 text-xs text-graphite-400">{c.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Logistics Tab ───────────────────────────────────────────────────────────

function LogisticsTab({ productId: _productId }: { productId: string }) {
  const routes = useQuery({
    queryKey: queryKeys.logistics.routes({ page: 1, limit: 10 }),
    queryFn: () => api.logistics.routes({ page: 1, limit: 10 }),
  });

  return (
    <div className="glass-panel">
      <div className="border-b border-glass-border px-3 py-2">
        <span className="section-label">LOGISTICS ROUTES</span>
      </div>
      {routes.isLoading && <TableSkeleton rows={3} cols={4} />}
      {routes.isSuccess && (!routes.data?.data || routes.data.data.length === 0) && (
        <EmptyState title="NO ROUTES" description="No logistics routes have been assessed." />
      )}
      {routes.isSuccess && routes.data?.data && routes.data.data.length > 0 && (
        <div className="divide-y divide-glass-border">
          {routes.data.data.slice(0, 10).map((r) => (
            <div key={r.id} className="flex items-center px-3 py-2">
              <span className="w-36 text-xs text-graphite-200">{r.originName ?? "Unknown"} → {r.destinationName ?? "Unknown"}</span>
              <span className="w-20 text-xs text-graphite-400">{formatValue(r.totalDistance, "—")} km</span>
              <span className="w-20 text-xs text-graphite-400">Risk: {formatValue(r.riskScore)}</span>
              <span className="text-xs text-graphite-400">{formatPercent(r.confidence)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Economics Tab ───────────────────────────────────────────────────────────

function EconomicsTab({ productId }: { productId: string }) {
  const landedCosts = useQuery({
    queryKey: queryKeys.pricing.landedCosts({ productId }),
    queryFn: () => api.pricing.landedCosts({ productId }),
  });

  const rawCosts = landedCosts.data;
  const costs: any[] = rawCosts
    ? Array.isArray(rawCosts)
      ? rawCosts
      : (rawCosts as { data?: any[] })?.data ?? []
    : [];
  const first = costs[0] as any;
  const hasComponents = first?.components?.length > 0;

  return (
    <div className="space-y-4">
      {/* Landed Cost Breakdown */}
      {landedCosts.isLoading && <CardSkeleton />}
      {landedCosts.isSuccess && hasComponents && (
        <CostBreakdown
          components={first.components.map((c: any) => ({ label: c.label, value: c.value ?? 0 }))}
          totalLabel="LANDED COST"
          currency={first.currency ?? "USD"}
        />
      )}
      {landedCosts.isSuccess && !hasComponents && (
        <EmptyState title="NO COST DATA" description="Landed cost has not been calculated for this product." />
      )}
    </div>
  );
}

// ─── Risks Tab ───────────────────────────────────────────────────────────────

function RisksTab({ productId }: { productId: string }) {
  const risks = useQuery({
    queryKey: queryKeys.opportunity.risks(productId),
    queryFn: () => api.opportunity.risks(productId),
  });

  return (
    <RiskPanel
      risks={risks.data?.data ?? []}
      title="PRODUCT RISKS"
      className=""
    />
  );
}

// ─── Research Tab ────────────────────────────────────────────────────────────

function ResearchTab({ productId }: { productId: string }) {
  const research = useQuery({
    queryKey: queryKeys.research.list({ productId }),
    queryFn: () => api.research.list({ productId }),
  });

  return (
    <div className="glass-panel">
      <div className="border-b border-glass-border px-3 py-2">
        <span className="section-label">RESEARCH REQUESTS</span>
      </div>
      {research.isLoading && <TableSkeleton rows={3} cols={3} />}
      {research.isSuccess && (!research.data?.data || research.data.data.length === 0) && (
        <EmptyState title="NO RESEARCH" description="No research requests have been made for this product." />
      )}
      {research.isSuccess && research.data?.data && research.data.data.length > 0 && (
        <div className="divide-y divide-glass-border">
          {research.data.data.map((r) => (
            <div key={r.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                  r.status === "completed" ? "bg-status-live/10 text-status-live" :
                  r.status === "processing" ? "bg-status-changed/10 text-status-changed" :
                  "bg-graphite-800 text-graphite-500"
                }`}>{r.status}</span>
                <span className="text-xs text-graphite-200">{r.question}</span>
              </div>
              {r.questionType && <p className="mt-1 text-[10px] text-graphite-500">{r.questionType}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Outreach Tab ────────────────────────────────────────────────────────────

function OutreachTab({ productId }: { productId: string }) {
  const campaigns = useQuery({
    queryKey: queryKeys.outreach.campaigns({ productId }),
    queryFn: () => api.outreach.campaigns({ productId }),
  });

  return (
    <div className="glass-panel">
      <div className="border-b border-glass-border px-3 py-2">
        <span className="section-label">OUTREACH CAMPAIGNS</span>
      </div>
      {campaigns.isLoading && <TableSkeleton rows={2} cols={3} />}
      {campaigns.isSuccess && (!campaigns.data?.data || campaigns.data.data.length === 0) && (
        <EmptyState title="NO OUTREACH" description="No outreach campaigns for this product." />
      )}
      {campaigns.isSuccess && campaigns.data?.data && campaigns.data.data.length > 0 && (
        <div className="divide-y divide-glass-border">
          {campaigns.data.data.map((c) => (
            <div key={c.id} className="flex items-center px-3 py-2">
              <span className="w-40 text-xs font-medium text-graphite-200">{c.name}</span>
              <span className={`w-20 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                c.status === "active" ? "bg-status-live/10 text-status-live" : "bg-graphite-800 text-graphite-500"
              }`}>{c.status}</span>
              <span className="text-xs text-graphite-400">{c.outreachCount} outreachs</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Evidence Tab ────────────────────────────────────────────────────────────

function EvidenceTab({ productId }: { productId: string }) {
  const evidence = useQuery({
    queryKey: queryKeys.evidence.list({ productId, page: 1, limit: 20 }),
    queryFn: () => api.evidence.list({ productId, page: 1, limit: 20 }),
  });
  const claims = useQuery({
    queryKey: queryKeys.claims.list({ subjectType: "PRODUCT", subjectId: productId }),
    queryFn: () => api.claims.list({ subjectType: "PRODUCT", subjectId: productId }),
  });

  return (
    <div className="space-y-4">
      {/* Evidence list */}
      <div className="glass-panel">
        <div className="border-b border-glass-border px-3 py-2">
          <span className="section-label">EVIDENCE</span>
        </div>
        {evidence.isLoading && <TableSkeleton rows={5} cols={4} />}
        {evidence.isSuccess && (!evidence.data?.data || evidence.data.data.length === 0) && (
          <EmptyState title="NO EVIDENCE" description="No evidence recorded for this product." />
        )}
        {evidence.isSuccess && evidence.data?.data && evidence.data.data.length > 0 && (
          <div className="divide-y divide-glass-border">
            {evidence.data.data.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2">
                <EvidenceBadge status={e.status} />
                <EvidenceBadge status={e.freshness} />
                <span className="w-28 text-xs text-graphite-300">{e.evidenceType}</span>
                <span className="flex-1 truncate text-xs text-graphite-400">{e.observedValue ?? "—"}</span>
                <span className="text-xs text-graphite-500">
                  {e.observedAt ? new Date(e.observedAt).toLocaleDateString() : "Unknown"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claims */}
      <div className="glass-panel">
        <div className="border-b border-glass-border px-3 py-2">
          <span className="section-label">CLAIMS</span>
        </div>
        {claims.isLoading && <TableSkeleton rows={2} cols={3} />}
        {claims.isSuccess && (!claims.data?.data || claims.data.data.length === 0) && (
          <div className="p-4"><p className="font-mono text-xs text-graphite-500">No claims recorded.</p></div>
        )}
        {claims.isSuccess && claims.data?.data && claims.data.data.length > 0 && (
          <div className="divide-y divide-glass-border">
            {claims.data.data.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-28 text-xs text-graphite-300">{c.claimType}</span>
                <span className="flex-1 text-xs text-graphite-400">{c.value ?? "—"}</span>
                <span className="text-xs text-graphite-400">{formatPercent(c.confidence)}</span>
                <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                  c.status === "verified" ? "bg-status-live/10 text-status-live" : "bg-graphite-800 text-graphite-500"
                }`}>{c.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
