// =============================================================================
// API — Pricing Intelligence Service (Phase 11)
// =============================================================================
// Orchestrator that loads pricing data from the database, runs the pure
// calculation engine, and persists results atomically with full provenance.
// Handles: assessment, recalculation, CRUD for observations/costs/scenarios.
// =============================================================================

import { prisma } from "@exosquad/database";
import { Prisma } from "@exosquad/database";
import type { PricingCalculationStatus } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { NotFoundError, PRICING_CONFIG } from "@exosquad/common";
import {
  runPricingEngine,
  computeObservationContentHash,
  computeCostComponentHash,
  computeLandedCostInputHash,
  computeScenarioContentHash,
  computeMarketSnapshotHash,
  computeAssessmentInputHash,
  normalizePriceObservation,
  aggregateMarketPrices,
  type PriceObservationInput,
  type CostComponentInput,
  type ExchangeRateInput,
  type MarketObservationGroup,
  type PricingEngineInput,
} from "./pricing-engine.js";

// ─── Assessment Input ────────────────────────────────────────────────────────

export interface AssessPricingInput {
  tenantId: string;
  productId: string;
  supplierId?: string | null;
  logisticsRouteId?: string | null;
  quantity?: number;
  targetCurrency?: string;
}

export interface PricingAssessmentResult {
  assessmentId: string;
  status: string;
  version: number;
  observationCount: number;
  costComponentCount: number;
  landedCostCount: number;
  scenarioCount: number;
  marketSnapshotCount: number;
  riskCount: number;
  overallConfidence: number;
  overallCompleteness: number;
  algorithmVersion: string;
}

// ─── Main Assessment Orchestrator ────────────────────────────────────────────

/**
 * Run pricing assessment for a product.
 * 1. Load price observations, cost components, exchange rates, market data
 * 2. Run the deterministic engine
 * 3. Persist landed cost, scenarios, market snapshots, risks, assessment
 * 4. Return summary
 */
export async function assessPricing(params: AssessPricingInput): Promise<PricingAssessmentResult> {
  const startTime = Date.now();
  const { tenantId, productId } = params;
  const supplierId = params.supplierId ?? null;
  const logisticsRouteId = params.logisticsRouteId ?? null;
  const quantity = params.quantity ?? 1;
  const targetCurrency = params.targetCurrency ?? PRICING_CONFIG.defaultTargetCurrency;

  logger.info({ tenantId, productId, supplierId, quantity }, "pricing_assessment_started");

  // 1. Load data
  const data = await loadPricingData(tenantId, productId, supplierId);

  // 2. Build engine input
  const engineInput: PricingEngineInput = {
    tenantId,
    productId,
    supplierId,
    logisticsRouteId,
    quantity,
    targetCurrency,
    observations: data.observations,
    costComponents: data.costComponents,
    exchangeRates: data.exchangeRates,
    marketObservations: data.marketObservations,
    referenceDate: new Date(),
  };

  // 3. Run engine
  const engineResult = runPricingEngine(engineInput);

  // 4. Persist results atomically
  const assessment = await prisma.$transaction(async (tx) => {
    // Determine next version
    const latestAssessment = await tx.pricingAssessment.findFirst({
      where: { tenantId, productId, supplierId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestAssessment?.version ?? 0) + 1;
    const calculatedAt = new Date();

    // Persist landed cost calculation
    const landedCost = await tx.landedCostCalculation.create({
      data: {
        tenantId,
        productId,
        supplierId,
        logisticsRouteId,
        quantity,
        currency: targetCurrency,
        productCost: engineResult.landedCost.productCost ?? 0,
        originCosts: engineResult.landedCost.originCosts ?? 0,
        freightCost: engineResult.landedCost.freightCost ?? 0,
        insuranceCost: engineResult.landedCost.insuranceCost ?? 0,
        dutyCost: engineResult.landedCost.dutyCost ?? 0,
        taxCost: engineResult.landedCost.taxCost ?? 0,
        portCost: engineResult.landedCost.portCost ?? 0,
        customsCost: engineResult.landedCost.customsCost ?? 0,
        clearingCost: engineResult.landedCost.clearingCost ?? 0,
        destinationCost: engineResult.landedCost.destinationCost ?? 0,
        otherCost: engineResult.landedCost.otherCost ?? 0,
        totalCost: engineResult.landedCost.totalCost ?? 0,
        unitLandedCost: engineResult.landedCost.unitLandedCost,
        status: (engineResult.landedCost.totalCost !== null ? "COMPLETE" : "INSUFFICIENT") as PricingCalculationStatus,
        unknownComponentFlags: engineResult.landedCost.unknownComponents,
        confidence: engineResult.confidence.score,
        completeness: engineResult.completeness.score,
        componentIds: data.costComponents.map((c) => c.id),
        observationIds: data.observations.map((o) => o.id),
        exchangeRateEvidenceId: data.exchangeRates.length > 0 ? data.exchangeRates[0]!.evidenceId : null,
        exchangeRateUsed: data.exchangeRates.length > 0 ? data.exchangeRates[0]!.rate : null,
        algorithmVersion: engineResult.algorithmVersion,
        inputHash: engineResult.inputHash,
        version: nextVersion,
        calculatedAt,
        contentHash: computeLandedCostInputHash(
          tenantId, productId, supplierId, logisticsRouteId, quantity,
          data.costComponents.map((c) => c.id),
          data.observations.map((o) => o.id),
          data.exchangeRates.map((r) => r.evidenceId ?? "none"),
          engineResult.algorithmVersion,
        ),
      },
    });

    // Persist market snapshots
    const marketSnapshotIds: string[] = [];
    for (const marketGroup of data.marketObservations) {
      const marketNorms = marketGroup.observations.map((o) =>
        normalizePriceObservation(o, marketGroup.targetCurrency, data.exchangeRates),
      );
      const stats = aggregateMarketPrices(marketNorms.map((n) => ({
        observationId: n.observationId,
        originalPrice: n.originalPrice,
        originalCurrency: n.originalCurrency,
        normalizedPrice: n.normalizedPrice,
        normalizedCurrency: n.normalizedCurrency,
        unitPrice: n.unitPrice,
        unitBasis: n.unitBasis,
        exchangeRateUsed: n.exchangeRateUsed,
        exchangeRateEvidenceId: n.exchangeRateEvidenceId,
        comparable: n.comparable,
        comparabilityIssue: n.comparabilityIssue,
      })));

      if (stats) {
        const snapshot = await tx.marketPriceSnapshot.create({
          data: {
            tenantId,
            productId,
            market: marketGroup.market,
            country: marketGroup.country,
            currency: stats.currency,
            observationCount: stats.observationCount,
            comparableCount: stats.comparableCount,
            incomparableCount: stats.incomparableCount,
            minPrice: stats.minPrice,
            maxPrice: stats.maxPrice,
            medianPrice: stats.medianPrice,
            averagePrice: stats.averagePrice,
            lowerQuartile: stats.lowerQuartile,
            upperQuartile: stats.upperQuartile,
            priceSpread: stats.priceSpread,
            spreadPercentage: stats.spreadPercentage,
            trendDirection: stats.trendDirection as "STABLE" | "RISING" | "DECLINING" | "VOLATILE" | "UNKNOWN",
            priceVolatility: stats.priceVolatility,
            confidence: engineResult.confidence.score,
            completeness: engineResult.completeness.score,
            observationIds: marketGroup.observations.map((o) => o.id),
            contentHash: computeMarketSnapshotHash(
              tenantId, productId, marketGroup.market,
              marketGroup.observations.map((o) => o.id),
              stats.currency, engineResult.algorithmVersion,
            ),
            algorithmVersion: engineResult.algorithmVersion,
            snapshotDate: calculatedAt,
          },
        });
        marketSnapshotIds.push(snapshot.id);
      }
    }

    // Persist pricing scenarios
    const scenarioIds: string[] = [];
    const scenarioTypes = ["CONSERVATIVE", "BASE", "UPSIDE"] as const;
    for (const scenarioType of scenarioTypes) {
      const engineScenario = engineResult.scenarios.find((s) => s.scenarioType === scenarioType);
      if (!engineScenario) continue;

      const scenario = await tx.pricingScenario.create({
        data: {
          tenantId,
          productId,
          landedCostCalculationId: landedCost.id,
          scenarioType: scenarioType as "CONSERVATIVE" | "BASE" | "UPSIDE",
          sellingPrice: engineScenario.sellingPrice,
          currency: engineScenario.currency,
          platformFees: engineScenario.platformFees,
          salesCommission: engineScenario.salesCommission,
          marketingCost: engineScenario.marketingCost,
          warehouseCost: engineScenario.warehouseCost,
          deliveryCost: engineScenario.deliveryCost,
          otherSellingCost: engineScenario.otherSellingCost,
          totalVariableCost: engineScenario.grossProfit !== null && engineScenario.sellingPrice !== null
            ? engineScenario.sellingPrice - engineScenario.grossProfit
            : null,
          grossProfit: engineScenario.grossProfit,
          grossMargin: engineScenario.grossMargin,
          markup: engineScenario.markup,
          breakEvenPrice: engineScenario.breakEvenPrice,
          pricePosition: engineScenario.pricePosition as "BELOW_MARKET" | "LOWER_MARKET" | "MID_MARKET" | "UPPER_MARKET" | "ABOVE_MARKET" | "UNKNOWN",
          confidence: engineResult.confidence.score,
          completeness: engineResult.completeness.score,
          status: (engineScenario.grossProfit !== null ? "COMPLETE" : "INSUFFICIENT") as PricingCalculationStatus,
          unknownInputFlags: engineScenario.unknownInputs,
          observationIds: data.observations.map((o) => o.id),
          algorithmVersion: engineResult.algorithmVersion,
          contentHash: computeScenarioContentHash(
            tenantId, productId, landedCost.id, scenarioType,
            engineScenario.sellingPrice, engineScenario.currency,
            engineScenario.platformFees, engineScenario.salesCommission,
            engineScenario.deliveryCost,
          ),
          calculatedAt,
        },
      });
      scenarioIds.push(scenario.id);
    }

    // Create assessment FIRST (risks need assessmentId FK)
    const newAssessment = await tx.pricingAssessment.create({
      data: {
        tenantId,
        productId,
        supplierId,
        status: (engineResult.landedCost.totalCost !== null ? "COMPLETE" : "INSUFFICIENT") as PricingCalculationStatus,
        algorithmVersion: engineResult.algorithmVersion,
        inputHash: computeAssessmentInputHash(
          tenantId, productId, supplierId,
          [landedCost.id], scenarioIds, marketSnapshotIds,
          data.observations.map((o) => o.id),
          engineResult.algorithmVersion,
        ),
        version: nextVersion,
        observationCount: data.observations.length,
        costComponentCount: data.costComponents.length,
        landedCostCount: 1,
        scenarioCount: scenarioIds.length,
        marketSnapshotCount: marketSnapshotIds.length,
        riskCount: engineResult.risks.length,
        overallConfidence: engineResult.confidence.score,
        overallCompleteness: engineResult.completeness.score,
        overallPriceVolatility: engineResult.marketStatistics?.priceVolatility ?? null,
        overallTrendDirection: (engineResult.marketStatistics?.trendDirection ?? "UNKNOWN") as "STABLE" | "RISING" | "DECLINING" | "VOLATILE" | "UNKNOWN",
        landedCostIds: [landedCost.id],
        scenarioIds,
        marketSnapshotIds,
        observationIds: data.observations.map((o) => o.id),
        calculatedAt,
      },
    });

    // Persist risks (now with valid assessmentId)
    for (const risk of engineResult.risks) {
      await tx.pricingRisk.create({
        data: {
          tenantId,
          assessmentId: newAssessment.id,
          riskType: risk.riskType as never,
          severity: risk.severity,
          description: risk.description,
          trigger: risk.trigger,
          affectedInput: risk.affectedInput,
          affectedEntityId: risk.affectedEntityId,
          affectedEntityType: risk.affectedEntityType,
          evidence: risk.evidence as Prisma.InputJsonValue,
        },
      });
    }

    return newAssessment;
  });

  const elapsed = Date.now() - startTime;
  logger.info(
    { tenantId, assessmentId: assessment.id, elapsedMs: elapsed },
    "pricing_assessment_completed",
  );

  return {
    assessmentId: assessment.id,
    status: assessment.status,
    version: assessment.version,
    observationCount: assessment.observationCount,
    costComponentCount: assessment.costComponentCount,
    landedCostCount: assessment.landedCostCount,
    scenarioCount: assessment.scenarioCount,
    marketSnapshotCount: assessment.marketSnapshotCount,
    riskCount: assessment.riskCount,
    overallConfidence: assessment.overallConfidence,
    overallCompleteness: assessment.overallCompleteness,
    algorithmVersion: assessment.algorithmVersion,
  };
}

// ─── Data Loader ─────────────────────────────────────────────────────────────

async function loadPricingData(tenantId: string, productId: string, supplierId: string | null) {
  // Load price observations
  const dbObservations = await prisma.priceObservation.findMany({
    where: { tenantId, productId, ...(supplierId ? { supplierId } : {}) },
  });

  // Load cost components
  const dbCostComponents = await prisma.costComponent.findMany({
    where: { tenantId, productId, ...(supplierId ? { supplierId } : {}) },
  });

  // Map to engine input types
  const observations: PriceObservationInput[] = dbObservations.map((o) => ({
    id: o.id,
    tenantId: o.tenantId,
    productId: o.productId,
    supplierId: o.supplierId,
    sourceType: o.sourceType,
    observationType: o.observationType,
    price: o.price,
    currency: o.currency,
    quantity: o.quantity,
    moq: o.moq,
    priceBasis: o.priceBasis,
    market: o.market,
    country: o.country,
    sourceUrl: o.sourceUrl,
    observedAt: o.observedAt,
    validUntil: o.validUntil,
    evidenceId: o.evidenceId,
    normalizedUnitPrice: o.normalizedUnitPrice,
    normalizedCurrency: o.normalizedCurrency,
    exchangeRateEvidenceId: o.exchangeRateEvidenceId,
    exchangeRateObservedAt: o.exchangeRateObservedAt,
    packSize: o.packSize,
    perUnitQuantity: o.perUnitQuantity,
    contentHash: o.contentHash,
  }));

  const costComponents: CostComponentInput[] = dbCostComponents.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    productId: c.productId,
    supplierId: c.supplierId,
    logisticsRouteId: c.logisticsRouteId,
    type: c.type,
    amount: c.amount,
    currency: c.currency,
    basis: c.basis,
    quantity: c.quantity,
    rate: c.rate,
    rateType: c.rateType,
    status: c.status,
    evidenceId: c.evidenceId,
    observedAt: c.observedAt,
    contentHash: c.contentHash,
  }));

  // Load exchange rates from existing observations that have rate evidence
  const exchangeRates: ExchangeRateInput[] = [];
  const seenRates = new Set<string>();
  for (const o of dbObservations) {
    if (o.exchangeRateEvidenceId && o.normalizedCurrency && o.currency !== o.normalizedCurrency) {
      const key = `${o.currency}->${o.normalizedCurrency}`;
      if (!seenRates.has(key)) {
        seenRates.add(key);
        // Derive rate from original and normalized prices if available
        if (o.normalizedUnitPrice && o.price > 0) {
          const impliedRate = o.normalizedUnitPrice / o.price;
          exchangeRates.push({
            fromCurrency: o.currency,
            toCurrency: o.normalizedCurrency,
            rate: impliedRate,
            observedAt: o.exchangeRateObservedAt ?? o.observedAt,
            evidenceId: o.exchangeRateEvidenceId,
          });
        }
      }
    }
  }

  // Group market observations by market
  const marketGroups: Map<string, MarketObservationGroup> = new Map();
  for (const obs of observations) {
    if (!obs.market) continue;
    const key = `${obs.market}:${obs.country ?? "BD"}`;
    if (!marketGroups.has(key)) {
      marketGroups.set(key, {
        observations: [],
        market: obs.market,
        country: obs.country ?? "BD",
        targetCurrency: PRICING_CONFIG.defaultTargetCurrency,
      });
    }
    marketGroups.get(key)!.observations.push(obs);
  }

  return {
    observations,
    costComponents,
    exchangeRates,
    marketObservations: Array.from(marketGroups.values()),
  };
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function getAssessment(tenantId: string, assessmentId: string) {
  const assessment = await prisma.pricingAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("PricingAssessment", assessmentId);
  return assessment;
}

export async function listAssessments(params: {
  tenantId: string;
  page: number;
  limit: number;
  productId?: string;
  supplierId?: string;
  status?: string;
}) {
  const { tenantId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (params.productId) where.productId = params.productId;
  if (params.supplierId) where.supplierId = params.supplierId;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.pricingAssessment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { calculatedAt: "desc" },
    }),
    prisma.pricingAssessment.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function recalculateAssessment(tenantId: string, assessmentId: string) {
  const assessment = await getAssessment(tenantId, assessmentId);
  return assessPricing({
    tenantId,
    productId: assessment.productId,
    supplierId: assessment.supplierId,
  });
}

// ─── Price Observation CRUD ──────────────────────────────────────────────────

export async function createPriceObservation(data: {
  tenantId: string;
  productId: string;
  supplierId?: string | null;
  sourceType: string;
  observationType: string;
  price: number;
  currency: string;
  quantity?: number | null;
  moq?: number | null;
  priceBasis?: string;
  market?: string | null;
  country?: string | null;
  sourceUrl?: string | null;
  observedAt: Date;
  validUntil?: Date | null;
  evidenceId?: string | null;
  packSize?: number | null;
  perUnitQuantity?: number | null;
}) {
  const contentHash = computeObservationContentHash(
    data.tenantId,
    data.productId,
    data.sourceType,
    data.observationType,
    data.price,
    data.currency,
    data.priceBasis ?? "UNIT",
    data.quantity ?? null,
    data.supplierId ?? null,
  );

  try {
    return await prisma.priceObservation.create({
      data: {
        tenantId: data.tenantId,
        productId: data.productId,
        supplierId: data.supplierId ?? null,
        sourceType: data.sourceType as never,
        observationType: data.observationType as never,
        price: data.price,
        currency: data.currency,
        quantity: data.quantity ?? null,
        moq: data.moq ?? null,
        priceBasis: (data.priceBasis ?? "UNIT") as never,
        market: data.market ?? null,
        country: data.country ?? null,
        sourceUrl: data.sourceUrl ?? null,
        observedAt: data.observedAt,
        validUntil: data.validUntil ?? null,
        evidenceId: data.evidenceId ?? null,
        packSize: data.packSize ?? null,
        perUnitQuantity: data.perUnitQuantity ?? null,
        contentHash,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Duplicate content hash — return existing
      return prisma.priceObservation.findFirst({
        where: { tenantId: data.tenantId, productId: data.productId, contentHash },
      });
    }
    throw e;
  }
}

export async function listPriceObservations(params: {
  tenantId: string;
  page: number;
  limit: number;
  productId?: string;
  supplierId?: string;
  sourceType?: string;
  observationType?: string;
  market?: string;
  currency?: string;
}) {
  const { tenantId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (params.productId) where.productId = params.productId;
  if (params.supplierId) where.supplierId = params.supplierId;
  if (params.sourceType) where.sourceType = params.sourceType;
  if (params.observationType) where.observationType = params.observationType;
  if (params.market) where.market = params.market;
  if (params.currency) where.currency = params.currency;

  const [data, total] = await Promise.all([
    prisma.priceObservation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { observedAt: "desc" },
    }),
    prisma.priceObservation.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Cost Component CRUD ─────────────────────────────────────────────────────

export async function createCostComponent(data: {
  tenantId: string;
  productId: string;
  supplierId?: string | null;
  logisticsRouteId?: string | null;
  type: string;
  amount: number;
  currency: string;
  basis?: string;
  quantity?: number | null;
  rate?: number | null;
  rateType?: string | null;
  status?: string;
  evidenceId?: string | null;
  observedAt?: Date | null;
}) {
  const contentHash = computeCostComponentHash(
    data.tenantId,
    data.productId,
    data.type,
    data.amount,
    data.currency,
    data.supplierId ?? null,
    data.logisticsRouteId ?? null,
  );

  try {
    return await prisma.costComponent.create({
      data: {
        tenantId: data.tenantId,
        productId: data.productId,
        supplierId: data.supplierId ?? null,
        logisticsRouteId: data.logisticsRouteId ?? null,
        type: data.type as never,
        amount: data.amount,
        currency: data.currency,
        basis: (data.basis ?? "UNIT") as never,
        quantity: data.quantity ?? null,
        rate: data.rate ?? null,
        rateType: data.rateType ?? null,
        status: (data.status ?? "OBSERVED") as never,
        evidenceId: data.evidenceId ?? null,
        observedAt: data.observedAt ?? null,
        contentHash,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return prisma.costComponent.findFirst({
        where: { tenantId: data.tenantId, productId: data.productId, contentHash },
      });
    }
    throw e;
  }
}

export async function listCostComponents(params: {
  tenantId: string;
  page: number;
  limit: number;
  productId?: string;
  supplierId?: string;
  type?: string;
  status?: string;
}) {
  const { tenantId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (params.productId) where.productId = params.productId;
  if (params.supplierId) where.supplierId = params.supplierId;
  if (params.type) where.type = params.type;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.costComponent.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.costComponent.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Assessment Detail Queries ───────────────────────────────────────────────

export async function getAssessmentLandedCosts(tenantId: string, assessmentId: string) {
  const assessment = await getAssessment(tenantId, assessmentId);
  const landedCostIds = assessment.landedCostIds as string[];
  return prisma.landedCostCalculation.findMany({
    where: { id: { in: landedCostIds }, tenantId },
  });
}

export async function getAssessmentScenarios(tenantId: string, assessmentId: string) {
  const assessment = await getAssessment(tenantId, assessmentId);
  const scenarioIds = assessment.scenarioIds as string[];
  return prisma.pricingScenario.findMany({
    where: { id: { in: scenarioIds }, tenantId },
  });
}

export async function getAssessmentMarketSnapshots(tenantId: string, assessmentId: string) {
  const assessment = await getAssessment(tenantId, assessmentId);
  const snapshotIds = assessment.marketSnapshotIds as string[];
  return prisma.marketPriceSnapshot.findMany({
    where: { id: { in: snapshotIds }, tenantId },
  });
}

export async function getAssessmentRisks(tenantId: string, assessmentId: string) {
  await getAssessment(tenantId, assessmentId);
  return prisma.pricingRisk.findMany({ where: { assessmentId, tenantId } });
}

export async function getAssessmentProvenance(tenantId: string, assessmentId: string) {
  const assessment = await getAssessment(tenantId, assessmentId);
  return {
    assessment: {
      id: assessment.id,
      productId: assessment.productId,
      supplierId: assessment.supplierId,
      version: assessment.version,
      algorithmVersion: assessment.algorithmVersion,
      inputHash: assessment.inputHash,
    },
    landedCostIds: assessment.landedCostIds,
    scenarioIds: assessment.scenarioIds,
    marketSnapshotIds: assessment.marketSnapshotIds,
    observationIds: assessment.observationIds,
  };
}

export async function getAssessmentHistory(tenantId: string, assessmentId: string) {
  const assessment = await getAssessment(tenantId, assessmentId);
  return prisma.pricingAssessment.findMany({
    where: { tenantId, productId: assessment.productId, supplierId: assessment.supplierId },
    orderBy: { version: "asc" },
  });
}

// ─── Landed Cost Queries ─────────────────────────────────────────────────────

export async function listLandedCosts(params: {
  tenantId: string;
  page: number;
  limit: number;
  productId?: string;
  supplierId?: string;
  status?: string;
}) {
  const { tenantId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (params.productId) where.productId = params.productId;
  if (params.supplierId) where.supplierId = params.supplierId;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.landedCostCalculation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { calculatedAt: "desc" },
    }),
    prisma.landedCostCalculation.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getLandedCost(tenantId: string, landedCostId: string) {
  const lc = await prisma.landedCostCalculation.findFirst({
    where: { id: landedCostId, tenantId },
  });
  if (!lc) throw new NotFoundError("LandedCostCalculation", landedCostId);
  return lc;
}

// ─── Scenario Queries ────────────────────────────────────────────────────────

export async function listScenarios(params: {
  tenantId: string;
  page: number;
  limit: number;
  productId?: string;
  scenarioType?: string;
  status?: string;
}) {
  const { tenantId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (params.productId) where.productId = params.productId;
  if (params.scenarioType) where.scenarioType = params.scenarioType;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.pricingScenario.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { calculatedAt: "desc" },
    }),
    prisma.pricingScenario.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Market Snapshot Queries ─────────────────────────────────────────────────

export async function listMarketSnapshots(params: {
  tenantId: string;
  page: number;
  limit: number;
  productId?: string;
  market?: string;
}) {
  const { tenantId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (params.productId) where.productId = params.productId;
  if (params.market) where.market = params.market;

  const [data, total] = await Promise.all([
    prisma.marketPriceSnapshot.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { snapshotDate: "desc" },
    }),
    prisma.marketPriceSnapshot.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
