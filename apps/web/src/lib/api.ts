import { getToken } from "./auth";

// ─── Error Types ─────────────────────────────────────────────────────────────

export interface ApiErrorBody {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// ─── Common Types ────────────────────────────────────────────────────────────

export interface Brand {
  id: string;
  name: string;
  normalizedName?: string;
}

export interface Category {
  id: string;
  name: string;
  path?: string;
}

export interface ProductIdentifier {
  id: string;
  type: string;
  value: string;
  normalized?: string;
  isValid: boolean;
  sourceId?: string;
}

export interface Product {
  id: string;
  name: string;
  normalizedName: string;
  brandId: string;
  categoryId: string;
  status: "active" | "merged" | "deprecated";
  brand: Brand;
  category: Category;
  identifiers: ProductIdentifier[];
  variants?: ProductVariant[];
  _count?: { variants: number; evidence: number };
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku?: string;
  createdAt: string;
}

// ─── Demand Types ────────────────────────────────────────────────────────────

export interface ProductDemand {
  productId: string;
  demandScore: number | null;
  confidence: number | null;
  sampleSize: number | null;
  window: string;
  geography?: string;
  calculatedAt: string;
}

export interface DemandHistoryPoint {
  date: string;
  value: number | null;
  signalType?: string;
  metric?: string;
}

export interface DemandProvenance {
  productId: string;
  calculationType: string;
  chain: Array<{
    entityType: string;
    entityId: string;
    value: unknown;
    evidenceCount: number;
    confidence: number | null;
  }>;
}

export interface DemandSignal {
  id: string;
  productId: string;
  signalType: string;
  metric: string;
  value: number | null;
  confidence: number | null;
  geography?: string;
  observedAt: string;
  sourceId?: string;
  createdAt: string;
}

export interface SignalSummary {
  productId: string;
  signals: Array<{
    signalType: string;
    metric: string;
    count: number;
    avgValue: number | null;
    latestValue: number | null;
  }>;
}

export interface ProductTrends {
  productId: string;
  trend: string | null;
  growth: number | null;
  acceleration: number | null;
  momentum: number | null;
  window: string;
  calculatedAt: string;
}

export interface MarketDemand {
  id: string;
  productId: string;
  brandId?: string;
  country?: string;
  geography?: string;
  signalType: string;
  trend: string | null;
  confidence: number | null;
  observedAt: string;
  createdAt: string;
}

// ─── Evidence Types ──────────────────────────────────────────────────────────

export interface Evidence {
  id: string;
  sourceId: string;
  observationId?: string;
  productId?: string;
  evidenceType: string;
  entityType: string;
  entityId: string;
  status: string;
  freshness: string;
  confidence: number | null;
  observedValue: string | null;
  observedAt: string;
  region?: string;
  createdAt: string;
}

export interface EvidenceDetail extends Evidence {
  quality?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EvidenceGraph {
  entityType: string;
  entityId: string;
  nodes: Array<{
    entityType: string;
    entityId: string;
    label?: string;
    evidenceCount: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship: string;
    confidence: number | null;
  }>;
}

export interface Claim {
  id: string;
  subjectType: string;
  subjectId: string;
  claimType: string;
  value: string | null;
  confidence: number | null;
  status: string;
  evidenceCount: number;
  createdAt: string;
}

export interface Conflict {
  id: string;
  entityType: string;
  entityId: string;
  conflictType: string;
  description: string;
  severity: string;
  status: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface ProvenanceChain {
  entityType: string;
  entityId: string;
  chain: Array<{
    entityType: string;
    entityId: string;
    relationship: string;
    confidence: number | null;
    evidenceCount: number;
  }>;
}

// ─── Supply Chain Types ──────────────────────────────────────────────────────

export interface SupplyChainAssessment {
  id: string;
  subjectType: string;
  subjectId: string;
  status: string;
  overallScore: number | null;
  confidence: number | null;
  nodeCount: number;
  edgeCount: number;
  calculatedAt: string;
  createdAt: string;
}

export interface SupplyChainNode {
  id: string;
  assessmentId: string;
  nodeType: string;
  name: string;
  country?: string;
  confidence: number | null;
}

export interface SupplyChainEdge {
  id: string;
  assessmentId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: string;
  confidence: number | null;
  riskScore: number | null;
}

export interface SupplyChainPath {
  id: string;
  assessmentId: string;
  nodes: string[];
  edges: string[];
  totalRisk: number | null;
  confidence: number | null;
}

export interface SupplyChainRelationship {
  id: string;
  nodeType: string;
  edgeType: string;
  status: string;
  confidence: number | null;
  country?: string;
  productId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Logistics Types ─────────────────────────────────────────────────────────

export interface LogisticsAssessment {
  id: string;
  subjectType: string;
  subjectId: string;
  status: string;
  overallScore: number | null;
  confidence: number | null;
  routeCount: number;
  legCount: number;
  calculatedAt: string;
  createdAt: string;
}

export interface LogisticsRoute {
  id: string;
  originNodeId?: string;
  destinationNodeId?: string;
  originName?: string;
  destinationName?: string;
  totalDistance?: number;
  estimatedDuration?: number;
  riskScore: number | null;
  confidence: number | null;
}

export interface LogisticsLeg {
  id: string;
  routeId?: string;
  originName?: string;
  destinationName?: string;
  mode?: string;
  distance?: number;
  duration?: number;
  riskScore: number | null;
  confidence: number | null;
}

export interface LogisticsRisk {
  id: string;
  assessmentId: string;
  riskType: string;
  severity: string;
  description: string;
  impact: string | null;
  requiredAction: string | null;
  confidence: number | null;
}

// ─── Pricing Types ───────────────────────────────────────────────────────────

export interface PricingAssessment {
  id: string;
  productId: string;
  status: string;
  landedCost: number | null;
  currency: string;
  confidence: number | null;
  calculatedAt: string;
  createdAt: string;
}

export interface PriceObservation {
  id: string;
  productId: string;
  observationType: string;
  value: number | null;
  currency: string;
  source?: string;
  observedAt: string;
  createdAt: string;
}

export interface CostComponent {
  id: string;
  assessmentId?: string;
  componentType: string;
  label: string;
  value: number | null;
  currency: string;
  percentage: number | null;
}

export interface LandedCost {
  id: string;
  assessmentId: string;
  productId?: string;
  totalCost: number | null;
  currency: string;
  components: CostComponent[];
  confidence: number | null;
  calculatedAt: string;
}

export interface PricingScenario {
  id: string;
  assessmentId: string;
  scenarioName: string;
  totalCost: number | null;
  currency: string;
  delta: number | null;
  assumptions?: Record<string, unknown>;
}

export interface MarketSnapshot {
  id: string;
  assessmentId: string;
  market: string;
  avgPrice: number | null;
  currency: string;
  minPrice: number | null;
  maxPrice: number | null;
  snapshotDate: string;
}

// ─── Opportunity Types ───────────────────────────────────────────────────────

export interface OpportunityAssessment {
  id: string;
  productId: string;
  status: string;
  opportunityScore: number | null;
  confidence: number | null;
  signalCount: number;
  riskCount: number;
  calculatedAt: string;
  createdAt: string;
  product?: Product;
}

export interface OpportunitySignal {
  id: string;
  assessmentId?: string;
  productId: string;
  signalType: string;
  direction: string;
  magnitude: number | null;
  confidence: number | null;
  description?: string;
  observedAt: string;
}

export interface OpportunityRisk {
  id: string;
  assessmentId?: string;
  productId: string;
  riskType: string;
  severity: string;
  description: string;
  impact: string | null;
  requiredAction: string | null;
  confidence: number | null;
}

export interface Competitor {
  id: string;
  productId: string;
  competitorName: string;
  competitorBrand?: string;
  marketPosition?: string;
  relativeStrength?: string;
  confidence: number | null;
  observedAt: string;
}

export interface CompetitorSnapshot {
  id: string;
  productId: string;
  competitorId?: string;
  snapshotDate: string;
  marketShare: number | null;
  pricePosition: number | null;
  trendDirection?: string;
}

// ─── Sourcing Types ──────────────────────────────────────────────────────────

export interface SourcingAssessment {
  id: string;
  productId: string;
  status: string;
  overallScore: number | null;
  confidence: number | null;
  supplierCount: number;
  calculatedAt: string;
  createdAt: string;
}

export interface SupplierAssessment {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  overallScore: number | null;
  reliability: number | null;
  leadTime: number | null;
  moq: number | null;
  unitPrice: number | null;
  currency?: string;
  confidence: number | null;
  country?: string;
}

export interface SourcingComparison {
  productId: string;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    score: number | null;
    price: number | null;
    leadTime: number | null;
    moq: number | null;
    reliability: number | null;
  }>;
}

export interface ProcurementViability {
  productId: string;
  viabilityScore: number | null;
  constraintLevel: string | null;
  alternatives: number;
  leadTimeAvg: number | null;
  confidence: number | null;
}

export interface SourcingConstraints {
  productId: string;
  constraints: Array<{
    type: string;
    description: string;
    severity: string;
    impact: string | null;
  }>;
}

// ─── Research Types ──────────────────────────────────────────────────────────

export interface ResearchRequest {
  id: string;
  question: string;
  questionType?: string;
  productId?: string;
  market?: string;
  country?: string;
  status: string;
  priority?: string;
  result?: string | null;
  confidence: number | null;
  createdAt: string;
  completedAt?: string;
}

export interface ResearchResult {
  requestId: string;
  result: string | null;
  confidence: number | null;
  sources: Array<{ type: string; id: string; relevance: number | null }>;
}

export interface ResearchGap {
  id: string;
  requestId: string;
  description: string;
  severity: string;
  type: string;
}

export interface ResearchContradiction {
  id: string;
  requestId: string;
  description: string;
  evidenceA: string;
  evidenceB: string;
  severity: string;
}

export interface ResearchHypothesis {
  id: string;
  requestId: string;
  hypothesis: string;
  confidence: number | null;
  supportingEvidence: number;
  contradictingEvidence: number;
}

// ─── Outreach Types ──────────────────────────────────────────────────────────

export interface OutreachCampaign {
  id: string;
  name: string;
  productId?: string;
  status: string;
  outreachCount: number;
  createdAt: string;
}

export interface Outreach {
  id: string;
  campaignId: string;
  supplierId?: string;
  supplierName?: string;
  status: string;
  subject?: string;
  createdAt: string;
  sentAt?: string;
  respondedAt?: string;
}

export interface OutreachMessage {
  id: string;
  outreachId: string;
  direction: "outbound" | "inbound";
  content: string;
  approvedAt?: string;
  sentAt?: string;
  createdAt: string;
}

export interface OutreachQualification {
  outreachId: string;
  qualified: boolean;
  score: number | null;
  criteria: Record<string, unknown>;
  qualifiedAt: string;
}

export interface OutreachThread {
  outreachId: string;
  messages: OutreachMessage[];
}

export interface OutreachTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category?: string;
  createdAt: string;
}

// ─── Calculation Types ───────────────────────────────────────────────────────

export interface Calculation {
  id: string;
  calculationType: string;
  entityType: string;
  entityId: string;
  result: Record<string, unknown>;
  confidence: number | null;
  calculatedAt: string;
}

// ─── Core Fetch ──────────────────────────────────────────────────────────────

const API_BASE = "/api/v1";

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("exosquad_token");
      localStorage.removeItem("exosquad_user");
      window.location.href = "/login";
    }
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new ApiError(
      res.status,
      body.error?.code ?? "UNKNOWN",
      body.error?.message ?? res.statusText,
      body.error?.context,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Typed API Client ────────────────────────────────────────────────────────

export const api = {
  // ── Health ───────────────────────────────────────────────────────────────
  health: () => apiFetch<{ status: string }>("/health"),

  // ── Auth ─────────────────────────────────────────────────────────────────
  auth: {
    me: () => apiFetch<{ user: { userId: string; email: string; name: string; tenantId: string; role: string } }>("/auth/me"),
  },

  // ── Products ─────────────────────────────────────────────────────────────
  products: {
    list: (params?: { page?: number; limit?: number; sortBy?: string; sortOrder?: string; brandId?: string; categoryId?: string; status?: string; search?: string }) =>
      apiFetch<PaginatedResponse<Product>>(`/products${buildQuery(params as Record<string, unknown>)}`),
    get: (id: string) => apiFetch<Product>(`/products/${id}`),
    demand: (id: string, params?: { windowDays?: number; geography?: string }) =>
      apiFetch<ProductDemand>(`/products/${id}/demand${buildQuery(params as Record<string, unknown>)}`),
    demandHistory: (id: string, params?: { startDate?: string; endDate?: string; signalType?: string; metric?: string; geography?: string; productVariantId?: string; windowDays?: number }) =>
      apiFetch<DemandHistoryPoint[]>(`/products/${id}/demand/history${buildQuery(params as Record<string, unknown>)}`),
    demandProvenance: (id: string, params?: { calculationType?: string }) =>
      apiFetch<DemandProvenance>(`/products/${id}/demand/provenance${buildQuery(params as Record<string, unknown>)}`),
    signals: (id: string, params?: { page?: number; limit?: number; sortBy?: string; sortOrder?: string; signalType?: string; metric?: string; geography?: string }) =>
      apiFetch<PaginatedResponse<DemandSignal>>(`/products/${id}/signals${buildQuery(params as Record<string, unknown>)}`),
    signalsSummary: (id: string) =>
      apiFetch<SignalSummary>(`/products/${id}/signals/summary`),
    trends: (id: string, params?: { windowDays?: number; geography?: string }) =>
      apiFetch<ProductTrends>(`/products/${id}/trends${buildQuery(params as Record<string, unknown>)}`),
  },

  // ── Market Demand ────────────────────────────────────────────────────────
  demand: {
    list: (params?: { page?: number; limit?: number; productId?: string; brandId?: string; country?: string; geography?: string; signalType?: string; trend?: string; confidenceMin?: number; confidenceMax?: number; dateStart?: string; dateEnd?: string }) =>
      apiFetch<PaginatedResponse<MarketDemand>>(`/demand${buildQuery(params as Record<string, unknown>)}`),
  },

  // ── Signals ──────────────────────────────────────────────────────────────
  signals: {
    list: (params?: { page?: number; limit?: number; signalType?: string; productId?: string }) =>
      apiFetch<PaginatedResponse<DemandSignal>>(`/signals${buildQuery(params as Record<string, unknown>)}`),
    get: (id: string) => apiFetch<DemandSignal>(`/signals/${id}`),
  },

  // ── Evidence ─────────────────────────────────────────────────────────────
  evidence: {
    list: (params?: { page?: number; limit?: number; sortBy?: string; sortOrder?: string; sourceId?: string; observationId?: string; productId?: string; evidenceType?: string; status?: string; freshness?: string; confidenceMin?: number; confidenceMax?: number; observedAfter?: string; observedBefore?: string; entityType?: string; entityId?: string; search?: string }) =>
      apiFetch<PaginatedResponse<Evidence>>(`/evidence${buildQuery(params as Record<string, unknown>)}`),
    get: (id: string) => apiFetch<EvidenceDetail>(`/evidence/${id}`),
    graph: (entityType: string, entityId: string, params?: { maxDepth?: number }) =>
      apiFetch<EvidenceGraph>(`/evidence/graph/${entityType}/${entityId}${buildQuery(params as Record<string, unknown>)}`),
    conflicts: (params?: { page?: number; limit?: number; entityType?: string; severity?: string; status?: string }) =>
      apiFetch<PaginatedResponse<Conflict>>(`/evidence/conflicts${buildQuery(params as Record<string, unknown>)}`),
    conflictDetail: (id: string) => apiFetch<Conflict>(`/evidence/conflicts/${id}`),
  },

  // ── Claims ───────────────────────────────────────────────────────────────
  claims: {
    list: (params?: { page?: number; limit?: number; subjectType?: string; subjectId?: string; claimType?: string; status?: string }) =>
      apiFetch<PaginatedResponse<Claim>>(`/claims${buildQuery(params as Record<string, unknown>)}`),
    get: (id: string) => apiFetch<Claim>(`/claims/${id}`),
  },

  // ── Provenance ───────────────────────────────────────────────────────────
  provenance: {
    get: (entityType: string, entityId: string, params?: { maxDepth?: number }) =>
      apiFetch<ProvenanceChain>(`/provenance/${entityType}/${entityId}${buildQuery(params as Record<string, unknown>)}`),
  },

  // ── Supply Chain ─────────────────────────────────────────────────────────
  supplyChain: {
    assess: (body: { subjectType: string; subjectId: string }) =>
      apiFetch<SupplyChainAssessment>("/supply-chain/assess", { method: "POST", body: JSON.stringify(body) }),
    list: (params?: { page?: number; limit?: number; subjectType?: string; subjectId?: string; status?: string }) =>
      apiFetch<PaginatedResponse<SupplyChainAssessment>>(`/supply-chain${buildQuery(params as Record<string, unknown>)}`),
    get: (id: string) => apiFetch<SupplyChainAssessment>(`/supply-chain/${id}`),
    recalculate: (id: string) =>
      apiFetch<{ status: string }>(`/supply-chain/${id}/recalculate`, { method: "POST" }),
    nodes: (id: string) => apiFetch<SupplyChainNode[]>(`/supply-chain/${id}/nodes`),
    edges: (id: string) => apiFetch<SupplyChainEdge[]>(`/supply-chain/${id}/edges`),
    paths: (id: string) => apiFetch<SupplyChainPath[]>(`/supply-chain/${id}/paths`),
    evidence: (id: string, params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<Evidence>>(`/supply-chain/${id}/evidence${buildQuery(params as Record<string, unknown>)}`),
    conflicts: (id: string) => apiFetch<Conflict[]>(`/supply-chain/${id}/conflicts`),
    provenance: (id: string) => apiFetch<ProvenanceChain>(`/supply-chain/${id}/provenance`),
    history: (id: string) => apiFetch<Array<{ timestamp: string; status: string; details?: Record<string, unknown> }>>(`/supply-chain/${id}/history`),
    verifications: (id: string) => apiFetch<Array<{ id: string; verifiedAt: string; verifiedBy: string; status: string }>>(`/supply-chain/${id}/verifications`),
    anomalies: (id: string) => apiFetch<Array<{ id: string; type: string; severity: string; description: string }>>(`/supply-chain/${id}/anomalies`),
    relationships: (params?: { page?: number; limit?: number; nodeType?: string; edgeType?: string; status?: string; confidence?: number; country?: string; productId?: string }) =>
      apiFetch<PaginatedResponse<SupplyChainRelationship>>(`/supply-chain/relationships${buildQuery(params as Record<string, unknown>)}`),
    claims: (params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<Claim>>(`/supply-chain/claims${buildQuery(params as Record<string, unknown>)}`),
    edgeDetail: (id: string) => apiFetch<SupplyChainEdge>(`/supply-chain/edges/${id}`),
    edgeProvenance: (id: string) => apiFetch<ProvenanceChain>(`/supply-chain/edges/${id}/provenance`),
    edgeObservations: (id: string) => apiFetch<Array<{ id: string; observationType: string; value: unknown; observedAt: string }>>(`/supply-chain/edges/${id}/observations`),
  },

  // ── Logistics ────────────────────────────────────────────────────────────
  logistics: {
    assess: (body: { subjectType: string; subjectId: string }) =>
      apiFetch<LogisticsAssessment>("/logistics/assess", { method: "POST", body: JSON.stringify(body) }),
    list: (params?: { page?: number; limit?: number; subjectType?: string; subjectId?: string; status?: string }) =>
      apiFetch<PaginatedResponse<LogisticsAssessment>>(`/logistics${buildQuery(params as Record<string, unknown>)}`),
    get: (id: string) => apiFetch<LogisticsAssessment>(`/logistics/${id}`),
    recalculate: (id: string) =>
      apiFetch<{ status: string }>(`/logistics/${id}/recalculate`, { method: "POST" }),
    routes: (params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<LogisticsRoute>>(`/logistics/routes${buildQuery(params as Record<string, unknown>)}`),
    legs: (params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<LogisticsLeg>>(`/logistics/legs${buildQuery(params as Record<string, unknown>)}`),
    relationships: (params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<SupplyChainRelationship>>(`/logistics/relationships${buildQuery(params as Record<string, unknown>)}`),
    discoverRoutes: (body: { originNodeId: string; destinationNodeId: string; maxDepth?: number; maxRoutes?: number }) =>
      apiFetch<{ routes: LogisticsRoute[] }>("/logistics/discover-routes", { method: "POST", body: JSON.stringify(body) }),
    nodes: (id: string) => apiFetch<SupplyChainNode[]>(`/logistics/${id}/nodes`),
    assessmentLegs: (id: string) => apiFetch<LogisticsLeg[]>(`/logistics/${id}/legs`),
    assessmentRoutes: (id: string) => apiFetch<LogisticsRoute[]>(`/logistics/${id}/routes`),
    evidence: (id: string, params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<Evidence>>(`/logistics/${id}/evidence${buildQuery(params as Record<string, unknown>)}`),
    conflicts: (id: string) => apiFetch<Conflict[]>(`/logistics/${id}/conflicts`),
    provenance: (id: string) => apiFetch<ProvenanceChain>(`/logistics/${id}/provenance`),
    history: (id: string) => apiFetch<Array<{ timestamp: string; status: string; details?: Record<string, unknown> }>>(`/logistics/${id}/history`),
    risks: (id: string) => apiFetch<LogisticsRisk[]>(`/logistics/${id}/risks`),
    verifications: (id: string) => apiFetch<Array<{ id: string; verifiedAt: string; verifiedBy: string; status: string }>>(`/logistics/${id}/verifications`),
    anomalies: (id: string) => apiFetch<Array<{ id: string; type: string; severity: string; description: string }>>(`/logistics/${id}/anomalies`),
  },

  // ── Pricing ──────────────────────────────────────────────────────────────
  pricing: {
    assess: (body: { productId: string; supplierId?: string; logisticsRouteId?: string; quantity?: number; targetCurrency?: string }) =>
      apiFetch<PricingAssessment>("/pricing/assess", { method: "POST", body: JSON.stringify(body) }),
    list: (params?: { page?: number; limit?: number; productId?: string; status?: string }) =>
      apiFetch<PaginatedResponse<PricingAssessment>>(`/pricing${buildQuery(params as Record<string, unknown>)}`),
    get: (id: string) => apiFetch<PricingAssessment>(`/pricing/${id}`),
    recalculate: (id: string) =>
      apiFetch<{ status: string }>(`/pricing/${id}/recalculate`, { method: "POST" }),
    landedCosts: (params?: { page?: number; limit?: number; productId?: string; assessmentId?: string }) =>
      apiFetch<PaginatedResponse<LandedCost> | LandedCost[]>(`/pricing/landed-costs${buildQuery(params as Record<string, unknown>)}`),
    landedCostDetail: (lcId: string) => apiFetch<LandedCost>(`/pricing/landed-costs/${lcId}`),
    scenarios: (params?: { page?: number; limit?: number; productId?: string; assessmentId?: string }) =>
      apiFetch<PaginatedResponse<PricingScenario> | PricingScenario[]>(`/pricing/scenarios${buildQuery(params as Record<string, unknown>)}`),
    marketSnapshots: (params?: { page?: number; limit?: number; productId?: string; assessmentId?: string }) =>
      apiFetch<PaginatedResponse<MarketSnapshot> | MarketSnapshot[]>(`/pricing/market-snapshots${buildQuery(params as Record<string, unknown>)}`),
    assessmentLandedCosts: (id: string) => apiFetch<LandedCost[]>(`/pricing/${id}/landed-costs`),
    assessmentScenarios: (id: string) => apiFetch<PricingScenario[]>(`/pricing/${id}/scenarios`),
    assessmentMarketSnapshots: (id: string) => apiFetch<MarketSnapshot[]>(`/pricing/${id}/market-snapshots`),
    assessmentRisks: (id: string) => apiFetch<Array<{ id: string; riskType: string; severity: string; description: string }>>(`/pricing/${id}/risks`),
    assessmentProvenance: (id: string) => apiFetch<ProvenanceChain>(`/pricing/${id}/provenance`),
    assessmentHistory: (id: string) => apiFetch<Array<{ timestamp: string; status: string; details?: Record<string, unknown> }>>(`/pricing/${id}/history`),
    observations: (params?: { page?: number; limit?: number; productId?: string }) =>
      apiFetch<PaginatedResponse<PriceObservation> | PriceObservation[]>(`/pricing/observations${buildQuery(params as Record<string, unknown>)}`),
    createObservation: (body: { productId: string; observationType: string; value: number; currency: string; source?: string }) =>
      apiFetch<PriceObservation>("/pricing/observations", { method: "POST", body: JSON.stringify(body) }),
    costComponents: (params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<CostComponent> | CostComponent[]>(`/pricing/cost-components${buildQuery(params as Record<string, unknown>)}`),
    createCostComponent: (body: { assessmentId?: string; componentType: string; label: string; value: number; currency: string }) =>
      apiFetch<CostComponent>("/pricing/cost-components", { method: "POST", body: JSON.stringify(body) }),
  },

  // ── Opportunity ──────────────────────────────────────────────────────────
  opportunity: {
    assess: (body: { productId: string }) =>
      apiFetch<OpportunityAssessment>("/opportunity/assess", { method: "POST", body: JSON.stringify(body) }),
    assessments: (params?: { page?: number; limit?: number; productId?: string; status?: string }) =>
      apiFetch<PaginatedResponse<OpportunityAssessment>>(`/opportunity/assessments${buildQuery(params as Record<string, unknown>)}`),
    assessmentDetail: (id: string) => apiFetch<OpportunityAssessment>(`/opportunity/assessments/${id}`),
    recalculate: (id: string) =>
      apiFetch<{ status: string }>(`/opportunity/assessments/${id}/recalculate`, { method: "POST" }),
    assessmentSignals: (id: string) => apiFetch<OpportunitySignal[]>(`/opportunity/assessments/${id}/signals`),
    assessmentRisks: (id: string) => apiFetch<OpportunityRisk[]>(`/opportunity/assessments/${id}/risks`),
    assessmentHistory: (id: string) => apiFetch<Array<{ timestamp: string; status: string; details?: Record<string, unknown> }>>(`/opportunity/assessments/${id}/history`),
    signals: (productId: string, params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<OpportunitySignal>>(`/opportunity/signals${buildQuery({ productId, ...params } as Record<string, unknown>)}`),
    risks: (productId: string, params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<OpportunityRisk>>(`/opportunity/risks${buildQuery({ productId, ...params } as Record<string, unknown>)}`),
    competitors: (productId: string, params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<Competitor> | Competitor[]>(`/opportunity/competitors${buildQuery({ productId, ...params } as Record<string, unknown>)}`),
    createCompetitor: (body: { productId: string; competitorName: string; competitorBrand?: string; marketPosition?: string }) =>
      apiFetch<Competitor>("/opportunity/competitors", { method: "POST", body: JSON.stringify(body) }),
    competitorSnapshots: (productId: string, params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<CompetitorSnapshot> | CompetitorSnapshot[]>(`/opportunity/competitor-snapshots${buildQuery({ productId, ...params } as Record<string, unknown>)}`),
  },

  // ── Sourcing ─────────────────────────────────────────────────────────────
  sourcing: {
    assess: (body: { productId: string }) =>
      apiFetch<SourcingAssessment>("/sourcing/assess", { method: "POST", body: JSON.stringify(body) }),
    assessments: (params?: { page?: number; limit?: number; productId?: string; status?: string }) =>
      apiFetch<PaginatedResponse<SourcingAssessment>>(`/sourcing/assessments${buildQuery(params as Record<string, unknown>)}`),
    assessmentDetail: (id: string) => apiFetch<SourcingAssessment>(`/sourcing/assessments/${id}`),
    recalculate: (id: string) =>
      apiFetch<{ status: string }>(`/sourcing/assessments/${id}/recalculate`, { method: "POST" }),
    assessmentHistory: (id: string) => apiFetch<Array<{ timestamp: string; status: string; details?: Record<string, unknown> }>>(`/sourcing/assessments/${id}/history`),
    productSuppliers: (productId: string) =>
      apiFetch<SupplierAssessment[]>(`/sourcing/products/${productId}/suppliers`),
    supplierDetail: (productId: string, supplierId: string) =>
      apiFetch<SupplierAssessment>(`/sourcing/products/${productId}/suppliers/${supplierId}`),
    comparison: (productId: string) =>
      apiFetch<SourcingComparison>(`/sourcing/products/${productId}/sourcing/comparison`),
    viability: (productId: string) =>
      apiFetch<ProcurementViability>(`/sourcing/products/${productId}/procurement-viability`),
    constraints: (productId: string) =>
      apiFetch<SourcingConstraints>(`/sourcing/products/${productId}/sourcing/constraints`),
    supplierContacts: (supplierId: string) =>
      apiFetch<Array<{ id: string; name: string; email?: string; phone?: string; role?: string }>>(`/sourcing/suppliers/${supplierId}/contacts`),
  },

  // ── Research ─────────────────────────────────────────────────────────────
  research: {
    create: (body: { question: string; questionType?: string; productId?: string; market?: string; country?: string }) =>
      apiFetch<ResearchRequest>("/research/requests", { method: "POST", body: JSON.stringify(body) }),
    list: (params?: { page?: number; limit?: number; questionType?: string; status?: string; productId?: string }) =>
      apiFetch<PaginatedResponse<ResearchRequest>>(`/research/requests${buildQuery(params as Record<string, unknown>)}`),
    get: (id: string) => apiFetch<ResearchRequest>(`/research/requests/${id}`),
    cancel: (id: string) =>
      apiFetch<ResearchRequest>(`/research/requests/${id}/cancel`, { method: "POST" }),
    result: (id: string) => apiFetch<ResearchResult>(`/research/requests/${id}/result`),
    evidence: (id: string) => apiFetch<Evidence[]>(`/research/requests/${id}/evidence`),
    gaps: (id: string) => apiFetch<ResearchGap[]>(`/research/requests/${id}/gaps`),
    contradictions: (id: string) => apiFetch<ResearchContradiction[]>(`/research/requests/${id}/contradictions`),
    hypotheses: (id: string) => apiFetch<ResearchHypothesis[]>(`/research/requests/${id}/hypotheses`),
    history: (params?: { page?: number; limit?: number; productId?: string }) =>
      apiFetch<PaginatedResponse<ResearchRequest>>(`/research/history${buildQuery(params as Record<string, unknown>)}`),
  },

  // ── Outreach ─────────────────────────────────────────────────────────────
  outreach: {
    createCampaign: (body: { name: string; productId?: string }) =>
      apiFetch<OutreachCampaign>("/outreach/campaigns", { method: "POST", body: JSON.stringify(body) }),
    campaigns: (params?: { page?: number; limit?: number; productId?: string }) =>
      apiFetch<PaginatedResponse<OutreachCampaign>>(`/outreach/campaigns${buildQuery(params as Record<string, unknown>)}`),
    campaignDetail: (id: string) => apiFetch<OutreachCampaign>(`/outreach/campaigns/${id}`),
    campaignOutreachs: (id: string) => apiFetch<Outreach[]>(`/outreach/campaigns/${id}/outreachs`),
    createOutreach: (body: { campaignId: string; supplierId?: string; subject?: string }) =>
      apiFetch<Outreach>("/outreach/outreachs", { method: "POST", body: JSON.stringify(body) }),
    outreachs: (params?: { page?: number; limit?: number; productId?: string; status?: string }) =>
      apiFetch<PaginatedResponse<Outreach>>(`/outreach/outreachs${buildQuery(params as Record<string, unknown>)}`),
    outreachDetail: (id: string) => apiFetch<Outreach>(`/outreach/outreachs/${id}`),
    createMessage: (outreachId: string, body: { content: string; direction?: string }) =>
      apiFetch<OutreachMessage>(`/outreach/outreachs/${outreachId}/messages`, { method: "POST", body: JSON.stringify(body) }),
    approveMessage: (outreachId: string, messageId: string) =>
      apiFetch<OutreachMessage>(`/outreach/outreachs/${outreachId}/messages/${messageId}/approve`, { method: "POST" }),
    approveOutreach: (id: string) =>
      apiFetch<Outreach>(`/outreach/outreachs/${id}/approve`, { method: "POST" }),
    sendOutreach: (id: string) =>
      apiFetch<Outreach>(`/outreach/outreachs/${id}/send`, { method: "POST" }),
    respond: (id: string, body: { content: string }) =>
      apiFetch<OutreachMessage>(`/outreach/outreachs/${id}/respond`, { method: "POST", body: JSON.stringify(body) }),
    analyzeResponse: (id: string) =>
      apiFetch<{ analysis: Record<string, unknown> }>(`/outreach/outreachs/${id}/analyze-response`, { method: "POST" }),
    qualify: (id: string) =>
      apiFetch<OutreachQualification>(`/outreach/outreachs/${id}/qualify`, { method: "POST" }),
    qualification: (id: string) => apiFetch<OutreachQualification>(`/outreach/outreachs/${id}/qualification`),
    thread: (id: string) => apiFetch<OutreachThread>(`/outreach/outreachs/${id}/thread`),
    outreachEvidence: (id: string) => apiFetch<Evidence[]>(`/outreach/outreachs/${id}/evidence`),
    followups: (id: string) => apiFetch<Array<{ id: string; scheduledAt: string; status: string; content?: string }>>(`/outreach/outreachs/${id}/followups`),
    createFollowup: (id: string, body: { scheduledAt: string; content?: string }) =>
      apiFetch<{ id: string; scheduledAt: string; status: string }>(`/outreach/outreachs/${id}/followups`, { method: "POST", body: JSON.stringify(body) }),
    createTemplate: (body: { name: string; subject: string; body: string; category?: string }) =>
      apiFetch<OutreachTemplate>("/outreach/templates", { method: "POST", body: JSON.stringify(body) }),
    templates: (params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<OutreachTemplate>>(`/outreach/templates${buildQuery(params as Record<string, unknown>)}`),
  },

  // ── Calculations ─────────────────────────────────────────────────────────
  calculations: {
    list: (params?: { page?: number; limit?: number }) =>
      apiFetch<PaginatedResponse<Calculation>>(`/calculations${buildQuery(params as Record<string, unknown>)}`),
    get: (id: string) => apiFetch<Calculation>(`/calculations/${id}`),
    provenance: (id: string) => apiFetch<ProvenanceChain>(`/calculations/${id}/provenance`),
  },
};
