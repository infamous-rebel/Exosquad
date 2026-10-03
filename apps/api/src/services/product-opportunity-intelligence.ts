// =============================================================================
// API — Product Opportunity Intelligence Service (Phase 12)
// =============================================================================
// Orchestrator that loads product data from the database, runs the pure
// product opportunity engine, and persists results atomically with full
// provenance. Handles: assessment, recalculation, queries, CRUD for
// competitor observations.
// =============================================================================

import { prisma } from "@exosquad/database";
import { Prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { NotFoundError, PRODUCT_OPP_CONFIG, PRODUCT_OPP_SIGNAL_TYPES } from "@exosquad/common";
import {
  runOpportunityEngine,
  computeCompetitorContentHash,
  computeCompetitorSnapshotHash,
  computeDemandSnapshotHash,
  computeOpportunityInputHash,
  computeOpportunityContentHash,
  computeViabilityContentHash,
  type OpportunityEngineInput,
  type CompetitorObservationInput,
  type DemandInput,
  type SupplyInput,
  type LogisticsInput,
  type PricingInput,
} from "./product-opportunity-engine.js";

// ─── Assessment Input / Result ───────────────────────────────────────────────

export interface AssessOpportunityInput {
  tenantId: string;
  productId: string;
}

export interface OpportunityAssessmentResult {
  assessmentId: string;
  status: string;
  version: number;
  opportunityScore: number;
  opportunityLevel: string;
  viabilityScore: number;
  viabilityLevel: string;
  confidence: number;
  completeness: number;
  competitorCount: number;
  signalCount: number;
  riskCount: number;
  constraintCount: number;
  gapCount: number;
  algorithmVersion: string;
}

// ─── Tenant-Isolation Guard ────────────────────────────────────────────

/**
 * The referenced product must belong to the caller's tenant. Prevents
 * cross-tenant productId references at write/assess entry points.
 */
async function assertProductInTenant(tenantId: string, productId: string): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { id: true },
  });
  if (!product) {
    throw new NotFoundError("Product", productId);
  }
}

// ─── Main Assessment Orchestrator ────────────────────────────────────────────

/**
 * Run product opportunity assessment for a product.
 * 1. Load competitor observations, demand data, supply chain, logistics, pricing
 * 2. Build engine input from Phase 7-11 data
 * 3. Run the deterministic engine
 * 4. Persist results atomically (snapshots, signals, risks, assessment)
 * 5. Return summary
 */
export async function assessProductOpportunity(
  params: AssessOpportunityInput,
): Promise<OpportunityAssessmentResult> {
  const startTime = Date.now();
  const { tenantId, productId } = params;

  await assertProductInTenant(tenantId, productId);

  logger.info({ tenantId, productId }, "product_opportunity_assessment_started");

  // 1. Load data from Phases 7-11
  const data = await loadOpportunityData(tenantId, productId);

  // 2. Build engine input
  const engineInput: OpportunityEngineInput = {
    tenantId,
    productId,
    competitors: data.competitors,
    demand: data.demand,
    supply: data.supply,
    logistics: data.logistics,
    pricing: data.pricing,
    referenceDate: new Date(),
  };

  // 3. Run engine
  const engineResult = runOpportunityEngine(engineInput);

  // 4. Persist results atomically
  const assessment = await prisma.$transaction(async (tx) => {
    const now = new Date();

    // Create competitor snapshot
    const competitionSnapshotHash = computeCompetitorSnapshotHash(
      tenantId,
      productId,
      data.competitors.length,
      engineResult.opportunity.competitionSignal.uniqueCompetitorCount,
      engineResult.opportunity.competitionSignal.competitionLevel,
      now,
    );
    const competitorSnapshot = await tx.competitorSnapshot.create({
      data: {
        tenantId,
        productId,
        observationCount: engineResult.opportunity.competitionSignal.competitorCount,
        uniqueCompetitorCount: engineResult.opportunity.competitionSignal.uniqueCompetitorCount,
        activeCompetitorCount: engineResult.opportunity.competitionSignal.activeCompetitorCount,
        minPrice: engineResult.opportunity.competitionSignal.priceRange.min,
        maxPrice: engineResult.opportunity.competitionSignal.priceRange.max,
        medianPrice: engineResult.opportunity.competitionSignal.priceRange.median,
        priceSpread: engineResult.opportunity.competitionSignal.priceRange.spread,
        marketConcentration: engineResult.opportunity.competitionSignal.marketConcentration,
        competitionLevel: engineResult.opportunity.competitionSignal.competitionLevel as never,
        snapshotDate: now,
        confidence: engineResult.opportunity.competitionSignal.pricePressure ?? 0.5,
        completeness: engineResult.opportunity.completeness,
        contentHash: competitionSnapshotHash,
      },
    });

    // Create demand opportunity snapshot
    const demandSnapshotHash = computeDemandSnapshotHash(
      tenantId,
      productId,
      data.demand.demandLevel,
      data.demand.demandMomentum,
      data.demand.observationCount,
      now,
    );
    const demandSnapshot = await tx.demandOpportunitySnapshot.create({
      data: {
        tenantId,
        productId,
        demandLevel: data.demand.demandLevel,
        demandMomentum: normalizeDemandMomentum(data.demand.demandMomentum) as never,
        searchGrowth: data.demand.searchGrowth,
        seasonality: data.demand.seasonality,
        trendStrength: data.demand.trendStrength,
        observationCount: data.demand.observationCount,
        confidence: data.demand.confidence,
        completeness: engineResult.opportunity.completeness,
        snapshotDate: now,
        contentHash: demandSnapshotHash,
      },
    });

    // Persist signals with dedup, collecting IDs for provenance
    const signalIds: string[] = [];
    for (const signal of engineResult.opportunity.signals) {
      const signalContentHash = computeOpportunityContentHash(
        tenantId,
        productId,
        engineResult.opportunity.opportunityScore,
        engineResult.opportunity.opportunityLevel,
        engineResult.opportunity.competitionSignal.competitionLevel,
        engineResult.opportunity.confidence,
        signalCountFor(signal.signalType, engineResult.opportunity.signals),
        engineResult.opportunity.risks.length,
      );
      const existing = await tx.productOppSignal.findUnique({
        where: {
          tenantId_productId_signalType_contentHash: {
            tenantId,
            productId,
            signalType: toPrismaSignalType(signal.signalType),
            contentHash: signalContentHash,
          },
        },
      });
      if (existing) {
        signalIds.push(existing.id);
      } else {
        const created = await tx.productOppSignal.create({
          data: {
            tenantId,
            productId,
            signalType: toPrismaSignalType(signal.signalType),
            direction: signal.direction,
            magnitude: signal.magnitude,
            evidence: signal.evidence,
            sourceReferences: [] as Prisma.InputJsonValue,
            detectedAt: now,
            contentHash: signalContentHash,
          },
        });
        signalIds.push(created.id);
      }
    }

    // Persist risks with dedup, collecting IDs for provenance
    const riskIds: string[] = [];
    for (const risk of engineResult.opportunity.risks) {
      const riskContentHash = computeViabilityContentHash(
        tenantId,
        productId,
        engineResult.viability.viabilityScore,
        engineResult.viability.viabilityLevel,
        engineResult.viability.estimatedGrossMargin,
        riskCountFor(risk.riskType, engineResult.opportunity.risks),
        engineResult.viability.confidence,
      );
      const existing = await tx.productOppRisk.findUnique({
        where: {
          tenantId_productId_riskType_contentHash: {
            tenantId,
            productId,
            riskType: toPrismaRiskType(risk.riskType),
            contentHash: riskContentHash,
          },
        },
      });
      if (existing) {
        riskIds.push(existing.id);
      } else {
        const created = await tx.productOppRisk.create({
          data: {
            tenantId,
            productId,
            riskType: toPrismaRiskType(risk.riskType),
            severity: risk.severity,
            trigger: risk.trigger,
            affectedDimension: risk.affectedDimension,
            evidenceReferences: [] as Prisma.InputJsonValue,
            detectedAt: now,
            contentHash: riskContentHash,
          },
        });
        riskIds.push(created.id);
      }
    }

    // Compute hashes for the assessment
    const inputHash = computeOpportunityInputHash(
      tenantId,
      productId,
      data.competitors.length,
      data.demand.demandLevel,
      data.demand.demandMomentum,
      data.supply.supplierCount,
      data.pricing.unitLandedCost,
      data.pricing.marketPriceMedian,
    );

    const viabilityContentHash = computeViabilityContentHash(
      tenantId,
      productId,
      engineResult.viability.viabilityScore,
      engineResult.viability.viabilityLevel,
      engineResult.viability.estimatedGrossMargin,
      engineResult.viability.constraints.length,
      engineResult.viability.confidence,
    );

    // Determine version (monotonically increasing per product)
    const latestAssessment = await tx.resellerViabilityAssessment.findFirst({
      where: { tenantId, productId },
      orderBy: { version: "desc" },
    });
    const version = (latestAssessment?.version ?? 0) + 1;

    // Create the assessment
    return tx.resellerViabilityAssessment.create({
      data: {
        tenantId,
        productId,
        // Demand metrics
        demandLevel: engineResult.opportunity.demandSignal.demandLevel,
        demandMomentum: normalizeDemandMomentum(engineResult.opportunity.demandSignal.demandMomentum) as never,
        demandConfidence: engineResult.opportunity.demandSignal.confidence,
        // Competition metrics
        competitionLevel: engineResult.opportunity.competitionSignal.competitionLevel as never,
        competitionStructure: "UNKNOWN" as never, // computed in future engine versions
        uniqueCompetitors: engineResult.opportunity.competitionSignal.uniqueCompetitorCount,
        activeListings: engineResult.opportunity.competitionSignal.activeCompetitorCount,
        competitionConfidence: engineResult.opportunity.competitionSignal.pricePressure ?? 0.5,
        // Supply metrics
        supplierCount: engineResult.opportunity.supplySignal.supplierCount,
        supplierDiversity: engineResult.opportunity.supplySignal.supplierDiversity,
        supplierConcentration: toPrismaConcentration(engineResult.opportunity.supplySignal.supplierConcentration),
        supplyConfidence: engineResult.opportunity.supplySignal.supplyConfidence,
        // Logistics metrics
        routeCount: engineResult.opportunity.logisticsSignal.routeCount,
        logisticsComplexity: engineResult.opportunity.logisticsSignal.logisticsComplexity,
        logisticsConfidence: engineResult.opportunity.logisticsSignal.logisticsConfidence,
        // Pricing metrics
        unitLandedCost: engineResult.opportunity.pricingSignal.marginRange.base !== null ? data.pricing.unitLandedCost : null,
        marketPriceMin: data.pricing.marketPriceMin,
        marketPriceMax: data.pricing.marketPriceMax,
        marketPriceMedian: data.pricing.marketPriceMedian,
        grossMarginMin: engineResult.opportunity.pricingSignal.marginRange.min,
        grossMarginMax: engineResult.opportunity.pricingSignal.marginRange.max,
        pricingConfidence: engineResult.opportunity.pricingSignal.pricingConfidence,
        // Market saturation
        marketSaturation: "UNKNOWN" as never, // computed in future engine versions
        priceCompression: engineResult.opportunity.competitionSignal.priceCompression,
        // Computed scores
        opportunityScore: engineResult.opportunity.opportunityScore,
        viabilityScore: engineResult.viability.viabilityScore,
        // Overall dimensions
        dataCompleteness: toPrismaCompleteness(engineResult.opportunity.completeness),
        commercialRisk: deriveCommercialRisk(
          engineResult.opportunity.pricingSignal.pricingConfidence,
          engineResult.opportunity.pricingSignal.marginRange.base,
        ),
        operationalRisk: deriveOperationalRisk(engineResult.opportunity.logisticsSignal),
        // Status
        status: "DETECTED" as never,
        // Provenance
        algorithmVersion: PRODUCT_OPP_CONFIG.algorithmVersion,
        inputHash,
        contentHash: viabilityContentHash,
        signalIds: signalIds as unknown as Prisma.InputJsonValue,
        riskIds: riskIds as unknown as Prisma.InputJsonValue,
        competitorSnapshotId: competitorSnapshot.id,
        demandSnapshotId: demandSnapshot.id,
        version,
        calculatedAt: now,
      },
    });
  });

  const duration = Date.now() - startTime;

  logger.info(
    {
      tenantId,
      productId,
      assessmentId: assessment.id,
      opportunityScore: engineResult.opportunity.opportunityScore,
      viabilityScore: engineResult.viability.viabilityScore,
      version: assessment.version,
      duration,
    },
    "product_opportunity_assessment_completed",
  );

  return {
    assessmentId: assessment.id,
    status: assessment.status,
    version: assessment.version,
    opportunityScore: engineResult.opportunity.opportunityScore,
    opportunityLevel: engineResult.opportunity.opportunityLevel,
    viabilityScore: engineResult.viability.viabilityScore,
    viabilityLevel: engineResult.viability.viabilityLevel,
    confidence: engineResult.opportunity.confidence,
    completeness: engineResult.opportunity.completeness,
    competitorCount: data.competitors.length,
    signalCount: engineResult.opportunity.signals.length,
    riskCount: engineResult.opportunity.risks.length,
    constraintCount: engineResult.viability.constraints.length,
    gapCount: engineResult.opportunity.marketGaps.length,
    algorithmVersion: PRODUCT_OPP_CONFIG.algorithmVersion,
  };
}

// ─── Recalculation ───────────────────────────────────────────────────────────

/**
 * Recalculate opportunity assessment for a product.
 * Creates a new version even if data hasn't changed.
 */
export async function recalculateProductOpportunity(
  params: AssessOpportunityInput,
): Promise<OpportunityAssessmentResult> {
  return assessProductOpportunity(params);
}

// ─── Query Functions ─────────────────────────────────────────────────────────

/**
 * List assessments for a tenant with pagination.
 */
export async function listAssessments(params: {
  tenantId: string;
  productId?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{
  data: Array<{
    id: string;
    productId: string;
    opportunityScore: number;
    viabilityScore: number;
    dataCompleteness: string;
    status: string;
    version: number;
    calculatedAt: Date;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const { tenantId, productId, status } = params;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.ResellerViabilityAssessmentWhereInput = { tenantId };
  if (productId) where.productId = productId;
  if (status) where.status = status as never;

  const [data, total] = await Promise.all([
    prisma.resellerViabilityAssessment.findMany({
      where,
      orderBy: { calculatedAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        productId: true,
        opportunityScore: true,
        viabilityScore: true,
        dataCompleteness: true,
        status: true,
        version: true,
        calculatedAt: true,
      },
    }),
    prisma.resellerViabilityAssessment.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Get a single assessment by ID with full detail.
 */
export async function getAssessment(params: {
  tenantId: string;
  assessmentId: string;
}) {
  const assessment = await prisma.resellerViabilityAssessment.findFirst({
    where: { id: params.assessmentId, tenantId: params.tenantId },
  });

  if (!assessment) {
    throw new NotFoundError("Assessment", params.assessmentId);
  }

  return assessment;
}

/**
 * Get assessment history for a product (all versions).
 */
export async function getAssessmentHistory(params: {
  tenantId: string;
  productId: string;
  limit?: number;
}) {
  return prisma.resellerViabilityAssessment.findMany({
    where: { tenantId: params.tenantId, productId: params.productId },
    orderBy: { version: "desc" },
    take: Math.min(100, params.limit ?? 20),
    select: {
      id: true,
      version: true,
      opportunityScore: true,
      viabilityScore: true,
      status: true,
      calculatedAt: true,
    },
  });
}

/**
 * List signals for a product.
 */
export async function listSignals(params: {
  tenantId: string;
  productId: string;
  signalType?: string;
  direction?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.ProductOppSignalWhereInput = {
    tenantId: params.tenantId,
    productId: params.productId,
  };
  if (params.signalType) where.signalType = params.signalType as never;
  if (params.direction) where.direction = params.direction;

  const [data, total] = await Promise.all([
    prisma.productOppSignal.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.productOppSignal.count({ where }),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

/**
 * List risks for a product.
 */
export async function listRisks(params: {
  tenantId: string;
  productId: string;
  severity?: string;
  riskType?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.ProductOppRiskWhereInput = {
    tenantId: params.tenantId,
    productId: params.productId,
  };
  if (params.severity) where.severity = params.severity;
  if (params.riskType) where.riskType = params.riskType as never;

  const [data, total] = await Promise.all([
    prisma.productOppRisk.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.productOppRisk.count({ where }),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

/**
 * Get competitor snapshots for a product.
 */
export async function listCompetitorSnapshots(params: {
  tenantId: string;
  productId: string;
  limit?: number;
}) {
  return prisma.competitorSnapshot.findMany({
    where: { tenantId: params.tenantId, productId: params.productId },
    orderBy: { snapshotDate: "desc" },
    take: Math.min(100, params.limit ?? 20),
  });
}

/**
 * List competitor observations for a product.
 */
export async function listCompetitorObservations(params: {
  tenantId: string;
  productId: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const where = { tenantId: params.tenantId, productId: params.productId };

  const [data, total] = await Promise.all([
    prisma.competitorObservation.findMany({
      where,
      orderBy: { observedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.competitorObservation.count({ where }),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

/**
 * Create a competitor observation (immutable — new observation per fetch).
 */
export async function createCompetitorObservation(params: {
  tenantId: string;
  productId: string;
  competitorName: string | null;
  sourceType: string;
  sourceUrl: string | null;
  market: string | null;
  country: string | null;
  sellingPrice: number | null;
  currency: string | null;
  priceBasis: string | null;
  rating: number | null;
  reviewCount: number | null;
  availability: string | null;
  observedAt: Date;
}): Promise<{ id: string; contentHash: string }> {
  await assertProductInTenant(params.tenantId, params.productId);

  const contentHash = computeCompetitorContentHash(
    params.tenantId,
    params.productId,
    params.sourceType,
    params.sellingPrice,
    params.currency,
    params.priceBasis,
    params.market,
    params.country,
    params.observedAt,
  );

  // Deduplicate by tenant + contentHash
  const existing = await prisma.competitorObservation.findFirst({
    where: { tenantId: params.tenantId, productId: params.productId, contentHash },
  });
  if (existing) {
    return { id: existing.id, contentHash };
  }

  const observation = await prisma.competitorObservation.create({
    data: {
      tenantId: params.tenantId,
      productId: params.productId,
      competitorName: params.competitorName,
      sourceType: params.sourceType,
      market: params.market,
      country: params.country,
      sellingPrice: params.sellingPrice,
      currency: params.currency,
      priceBasis: params.priceBasis,
      rating: params.rating,
      reviewCount: params.reviewCount,
      availability: params.availability,
      observedAt: params.observedAt,
      contentHash,
    },
  });

  return { id: observation.id, contentHash };
}

/**
 * Expire assessments older than the freshness window.
 */
export async function expireStaleAssessments(params: {
  tenantId: string;
}): Promise<{ expired: number }> {
  const staleThreshold = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000,
  );

  const result = await prisma.resellerViabilityAssessment.updateMany({
    where: {
      tenantId: params.tenantId,
      status: { not: "EXPIRED" },
      calculatedAt: { lt: staleThreshold },
    },
    data: { status: "EXPIRED" },
  });

  if (result.count > 0) {
    logger.info(
      { tenantId: params.tenantId, expired: result.count },
      "opportunity_assessments_expired",
    );
  }

  return { expired: result.count };
}

// ─── Data Loading ────────────────────────────────────────────────────────────

interface OpportunityData {
  competitors: CompetitorObservationInput[];
  demand: DemandInput;
  supply: SupplyInput;
  logistics: LogisticsInput;
  pricing: PricingInput;
}

async function loadOpportunityData(
  tenantId: string,
  productId: string,
): Promise<OpportunityData> {
  // Load competitor observations (fresh window)
  const staleThreshold = new Date(
    Date.now() - PRODUCT_OPP_CONFIG.staleCompetitorObservationThresholdDays * 24 * 60 * 60 * 1000,
  );
  const competitorObs = await prisma.competitorObservation.findMany({
    where: { tenantId, productId, observedAt: { gte: staleThreshold } },
    orderBy: { observedAt: "desc" },
    take: 100,
  });

  const competitors: CompetitorObservationInput[] = competitorObs.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    productId: c.productId,
    competitorName: c.competitorName,
    sourceType: c.sourceType,
    market: c.market,
    country: c.country,
    sellingPrice: c.sellingPrice,
    currency: c.currency,
    priceBasis: c.priceBasis,
    rating: c.rating,
    reviewCount: c.reviewCount,
    availability: c.availability,
    observedAt: c.observedAt,
    contentHash: c.contentHash,
  }));

  // Load demand data from Phase 7
  const demandSignals = await prisma.demandSignal.findMany({
    where: { tenantId, productId, status: "active" },
    orderBy: { observedAt: "desc" },
    take: 50,
  });

  const demandCalculations = await prisma.demandCalculation.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const latestCalc = demandCalculations[0];
  const avgConfidence = demandSignals.length > 0
    ? demandSignals.reduce((s, d) => s + d.confidence, 0) / demandSignals.length
    : 0.5;

  // Extract trend info from the latest DemandCalculation result JSON
  const calcResult = (latestCalc?.result ?? {}) as Record<string, unknown>;
  const trendValue = typeof calcResult.trend === "string" ? calcResult.trend : null;
  const growthValue = typeof calcResult.growthRate === "number" ? calcResult.growthRate : null;

  const demand: DemandInput = {
    demandLevel: demandSignals.length > 0 ? deriveDemandLevel(demandSignals.length) : null,
    demandMomentum: normalizeDemandMomentum(trendValue),
    searchGrowth: growthValue,
    seasonality: null,
    trendStrength: null,
    observationCount: demandSignals.length,
    confidence: avgConfidence,
    volatility: null,
  };

  // Load supply data from Phase 9
  const supplyNodes = await prisma.supplyChainNode.findMany({
    where: { tenantId, nodeType: { in: ["SUPPLIER", "MANUFACTURER"] } },
    take: 50,
  });

  const supplierCountries = new Set(
    supplyNodes.map((n) => n.country).filter((c): c is string => Boolean(c)),
  );

  const supply: SupplyInput = {
    supplierCount: supplyNodes.length > 0 ? supplyNodes.length : null,
    supplierCountryCount: supplierCountries.size > 0 ? supplierCountries.size : null,
    supplierPriceSpread: null, // Requires supplier-level pricing analysis
    supplierReliability: null, // Requires historical reliability data
    supplyCompleteness: supplyNodes.length > 0 ? Math.min(1, supplyNodes.length / 5) : 0,
  };

  // Load logistics data from Phase 10
  const logisticsLegs = await prisma.logisticsLeg.findMany({
    where: { tenantId },
    take: 50,
  });

  const logistics: LogisticsInput = {
    routeCount: logisticsLegs.length > 0 ? logisticsLegs.length : null,
    availableModes: [...new Set(logisticsLegs.map((e) => String(e.legType)).filter((m) => m.length > 0))],
    routeReliability: logisticsLegs.length > 0
      ? logisticsLegs.reduce((s, l) => s + l.confidence, 0) / logisticsLegs.length
      : null,
    transitTimeRange: null,
    transitTimeUncertainty: null,
    numberOfHops: logisticsLegs.length > 0 ? Math.min(10, logisticsLegs.length) : null,
    logisticsRiskCount: 0,
  };

  // Load pricing data from Phase 11
  const priceObs = await prisma.priceObservation.findMany({
    where: { tenantId, productId },
    orderBy: { observedAt: "desc" },
    take: 50,
  });

  const landedCosts = await prisma.landedCostCalculation.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const prices = priceObs
    .map((p) => p.normalizedUnitPrice ?? p.price)
    .filter((p): p is number => p !== null && p > 0)
    .sort((a, b) => a - b);

  const latestLandedCost = landedCosts[0];

  const pricing: PricingInput = {
    unitLandedCost: latestLandedCost?.unitLandedCost ?? null,
    marketPriceMin: prices.length > 0 ? prices[0] ?? null : null,
    marketPriceMax: prices.length > 0 ? prices[prices.length - 1] ?? null : null,
    marketPriceMedian: prices.length > 0 ? prices[Math.floor(prices.length / 2)] ?? null : null,
    grossMarginMin: null,
    grossMarginMax: null,
    grossMarginBase: null,
    priceVolatility: null,
    pricingRiskCount: 0,
  };

  return { competitors, demand, supply, logistics, pricing };
}

// ─── Mapping Helpers ─────────────────────────────────────────────────────────

function normalizeDemandMomentum(value: string | null | undefined): string {
  if (!value) return "UNKNOWN";
  const upper = value.toUpperCase();
  if (["ACCELERATING", "GROWING", "STABLE", "DECLINING", "VOLATILE", "UNKNOWN"].includes(upper)) {
    return upper;
  }
  // Map Phase 7 trend values to momentum values
  if (upper === "RISING" || upper === "UP") return "GROWING";
  if (upper === "FALLING" || upper === "DOWN") return "DECLINING";
  if (upper === "FLAT") return "STABLE";
  return "UNKNOWN";
}

function deriveDemandLevel(signalCount: number): string {
  if (signalCount >= 20) return "HIGH";
  if (signalCount >= 8) return "MODERATE";
  return "LOW";
}

function toPrismaSignalType(signalType: string): never {
  // Engine signal types are defined to match PRODUCT_OPP_SIGNAL_TYPES exactly.
  // Fail loudly on unknown values — never fabricate a signal type.
  if ((PRODUCT_OPP_SIGNAL_TYPES as readonly string[]).includes(signalType)) {
    return signalType as never;
  }
  throw new Error(`Unknown opportunity signal type: ${signalType}`);
}

function toPrismaRiskType(riskType: string): never {
  // Engine risk types map directly to Prisma enum values
  return riskType as never;
}

function toPrismaConcentration(concentration: string): never {
  const mapping: Record<string, string> = {
    DIVERSIFIED: "DIVERSIFIED",
    MODERATELY_CONCENTRATED: "MODERATELY_CONCENTRATED",
    CONCENTRATED: "CONCENTRATED",
    HIGHLY_CONCENTRATED: "HIGHLY_CONCENTRATED",
    UNKNOWN: "UNKNOWN",
  };
  return (mapping[concentration] ?? "UNKNOWN") as never;
}

function toPrismaCompleteness(completeness: number): never {
  // Maps to the DataCompletenessBand enum: HIGH | MODERATE | LOW | VERY_LOW | UNKNOWN
  if (completeness >= 0.75) return "HIGH" as never;
  if (completeness >= 0.5) return "MODERATE" as never;
  if (completeness >= 0.25) return "LOW" as never;
  if (completeness > 0) return "VERY_LOW" as never;
  return "UNKNOWN" as never;
}

function deriveCommercialRisk(pricingConfidence: number, marginBase: number | null): string {
  // Margin is the primary commercial fact when known; confidence modulates
  // certainty only when margin is UNKNOWN (never fabricated).
  if (marginBase !== null) {
    if (marginBase < 0.05) return "HIGH";
    if (marginBase < 0.15) return "MODERATE";
    return "LOW";
  }
  if (pricingConfidence < 0.3) return "HIGH";
  if (pricingConfidence < 0.6) return "MODERATE";
  return "LOW";
}

function deriveOperationalRisk(logistics: { logisticsComplexity: string; logisticsConfidence: number }): string {
  if (logistics.logisticsComplexity === "HIGH") return "HIGH";
  if (logistics.logisticsComplexity === "UNKNOWN") return "MODERATE";
  if (logistics.logisticsConfidence < 0.5) return "MODERATE";
  return "LOW";
}

function signalCountFor(signalType: string, signals: Array<{ signalType: string }>): number {
  return signals.filter((s) => s.signalType === signalType).length;
}

function riskCountFor(riskType: string, risks: Array<{ riskType: string }>): number {
  return risks.filter((r) => r.riskType === riskType).length;
}
