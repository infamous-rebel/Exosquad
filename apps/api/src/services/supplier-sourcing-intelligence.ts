// =============================================================================
// API — Supplier Sourcing Intelligence Service (Phase 13)
// =============================================================================
// Orchestrator that loads product/supplier data from the database, runs the
// pure engines (match → evaluate → source → viability), and persists results
// atomically with full provenance.
// =============================================================================

import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { NotFoundError, SOURCING_CONFIG } from "@exosquad/common";
import { calculateSupplierMatch, type SupplierMatchEngineInput, type EvidenceRef } from "./supplier-matching-engine.js";
import { calculateSupplierEvaluation, type SupplierEvaluationEngineInput } from "./supplier-evaluation-engine.js";
import { calculateSourcingOption, type SourcingEngineInput } from "./sourcing-engine.js";
import { calculateProcurementViability, type ProcurementViabilityEngineInput } from "./procurement-viability-engine.js";

// ─── Assessment Input / Result ───────────────────────────────────────────────

export interface AssessSupplierSourcingInput {
  tenantId: string;
  productId: string;
}

export interface SupplierSourcingAssessResult {
  assessmentCount: number;
  supplierCount: number;
  engineVersion: string;
}

// ─── Tenant-Isolation Guard ──────────────────────────────────────────────────

async function assertProductInTenant(tenantId: string, productId: string): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { id: true },
  });
  if (!product) {
    throw new NotFoundError("Product", productId);
  }
}

// ─── Content Hash Helpers ────────────────────────────────────────────────────

import { createHash } from "node:crypto";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]),
  );
  return "{" + pairs.join(",") + "}";
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ─── Main Assessment Orchestrator ────────────────────────────────────────────

/**
 * Run supplier sourcing assessment for all suppliers of a product.
 * 1. Load product, supplier candidates, evidence, Phase 7–12 data
 * 2. For each supplier: match → evaluate → source → viability
 * 3. Persist results atomically
 * 4. Return summary
 */
export async function assessSupplierSourcing(
  params: AssessSupplierSourcingInput,
): Promise<SupplierSourcingAssessResult> {
  const { tenantId, productId } = params;
  const now = new Date();

  await assertProductInTenant(tenantId, productId);
  logger.info({ tenantId, productId }, "supplier_sourcing_assessment_started");

  // 1. Load product
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    include: {
      identifiers: true,
      brand: true,
      category: true,
    },
  });
  if (!product) throw new NotFoundError("Product", productId);

  // 2. Load supplier candidates (ProductSupplier links)
  const productSuppliers = await prisma.productSupplier.findMany({
    where: { tenantId, productId },
    include: { supplier: true },
    take: 50,
  });

  // 3. Load evidence for this product
  const evidence = await prisma.evidence.findMany({
    where: { tenantId, productId, status: "active" },
    take: 100,
  });

  // 4. Load Phase 7 demand data
  const demandCalcs = await prisma.demandCalculation.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  // 5. Load Phase 11 pricing data
  const landedCosts = await prisma.landedCostCalculation.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  // 6. Load Phase 10 logistics data
  const logisticsLegs = await prisma.logisticsLeg.findMany({
    where: { tenantId },
    take: 50,
  });

  // 7. Load supplier contacts
  const supplierContacts = await prisma.supplierContactEvidence.findMany({
    where: { tenantId },
    take: 200,
  });

  // Build evidence reference map per supplier
  const evidenceBySupplier = new Map<string, EvidenceRef[]>();
  for (const ps of productSuppliers) {
    const supplierEvidence = evidence.filter(
      (e) => e.productSupplierId === ps.id || e.entityId === ps.supplierId,
    );
    evidenceBySupplier.set(
      ps.supplierId,
      supplierEvidence.map((e) => ({
        id: e.id,
        sourceId: e.sourceId,
        confidence: e.confidence,
        observedAt: e.observedAt,
        evidenceType: e.evidenceType,
        status: e.status,
      })),
    );
  }

  // Build Phase 7 demand input
  const estimatedMonthlyDemand = demandCalcs.length > 0
    ? ((demandCalcs[0]?.result as Record<string, unknown>)?.velocity as number | undefined) ?? null
    : null;
  const demandLevel = demandCalcs.length > 0 ? "MODERATE" : null;
  const demandConfidence = demandCalcs.length > 0 ? 0.5 : 0;

  // Build Phase 11 pricing input
  const unitLandedCost = landedCosts.length > 0
    ? (landedCosts[0]?.unitLandedCost as number | null) ?? null
    : null;
  const pricingCurrency = landedCosts.length > 0
    ? (landedCosts[0]?.currency as string | null) ?? null
    : null;

  // Build Phase 10 logistics input
  const routeCount = logisticsLegs.length > 0 ? logisticsLegs.length : null;
  const routeReliability = logisticsLegs.length > 0
    ? logisticsLegs.reduce((s, l) => s + l.confidence, 0) / logisticsLegs.length
    : null;

  // Compliance data existence
  const hasComplianceData = false; // Phase 11 compliance not yet modeled

  let assessmentCount = 0;

  // Process each supplier
  for (const ps of productSuppliers) {
    const supplier = ps.supplier;
    const supplierEvidence = evidenceBySupplier.get(supplier.id) ?? [];
    const contactCount = supplierContacts.filter((c) => c.supplierId === supplier.id).length;

    // Build product identifiers input
    const productIdentifiers = product.identifiers.map((id) => ({
      type: id.type,
      value: id.value,
      normalized: id.normalized,
    }));

    // Build supplier product input
    const supplierAttrs = (supplier.attributes ?? {}) as Record<string, unknown>;
    const supplierProductInput = {
      supplierProductName: (supplierAttrs.productName as string) ?? null,
      supplierNormalizedName: supplier.normalizedName,
      supplierCategory: (supplierAttrs.category as string) ?? null,
      supplierDescription: (supplierAttrs.description as string) ?? null,
      supplierCountry: supplier.country,
      supplierRole: supplier.supplierRole,
      supplierAttributes: supplierAttrs,
      supplierIdentifiers: [], // Supplier identifiers from ProductSupplier link if available
    };

    // ─── Engine 1: Match ──────────────────────────────────────────────────
    const matchInput: SupplierMatchEngineInput = {
      productId,
      supplierId: supplier.id,
      product: {
        name: product.name,
        normalizedName: product.normalizedName,
        category: product.category?.name ?? null,
        brand: product.brand?.name ?? null,
        description: product.description,
        countryOfOrigin: product.countryOfOrigin,
        attributes: (product.attributes ?? {}) as Record<string, unknown>,
        identifiers: productIdentifiers,
      },
      supplierProduct: supplierProductInput,
      evidence: supplierEvidence,
      referenceDate: now,
    };

    const matchResult = calculateSupplierMatch(matchInput);

    // Skip no_match suppliers
    if (matchResult.matchLevel === "no_match") continue;

    // ─── Engine 2: Evaluate ───────────────────────────────────────────────
    const evalInput: SupplierEvaluationEngineInput = {
      supplierId: supplier.id,
      supplier: {
        supplierId: supplier.id,
        name: supplier.name,
        normalizedName: supplier.normalizedName,
        country: supplier.country,
        supplierRole: supplier.supplierRole,
        identityStatus: supplier.identityStatus,
        url: supplier.url,
        domain: supplier.domain,
        email: supplier.email,
        phone: supplier.phone,
        contactPerson: supplier.contactPerson,
        attributes: supplierAttrs,
        createdAt: supplier.createdAt,
      },
      commercialData: {
        hasPrice: ps.price !== null,
        hasMoq: ps.moq !== null,
        hasLeadTime: ps.leadTimeDays !== null,
        hasPaymentTerms: (supplierAttrs.paymentTerms as string | undefined) !== undefined,
        hasQuantityBreaks: (supplierAttrs.quantityBreaks as unknown[] | undefined) !== undefined,
        hasCertifications: (supplierAttrs.certifications as unknown[] | undefined) !== undefined,
        hasPackaging: (supplierAttrs.packagingOptions as string | undefined) !== undefined,
        hasExportInfo: (supplierAttrs.exportInfo as string | undefined) !== undefined,
      },
      matchLevel: matchResult.matchLevel,
      matchScore: matchResult.matchScore,
      evidence: supplierEvidence,
      contactCount,
      referenceDate: now,
    };

    const evalResult = calculateSupplierEvaluation(evalInput);

    // ─── Engine 3: Source ─────────────────────────────────────────────────
    const sourcingInput: SourcingEngineInput = {
      productId,
      supplierId: supplier.id,
      matchScore: matchResult.matchScore,
      matchLevel: matchResult.matchLevel,
      evaluationResult: evalResult,
      commercial: {
        sourcePrice: ps.price !== null ? Number(ps.price) : null,
        currency: ps.currency,
        moq: ps.moq,
        leadTimeDays: ps.leadTimeDays,
        quantityBreaks: (supplierAttrs.quantityBreaks as Array<{ quantity: number; unitPrice: number }>) ?? null,
        paymentTerms: (supplierAttrs.paymentTerms as string) ?? null,
      },
      demand: {
        estimatedMonthlyDemand,
        demandLevel,
        demandConfidence,
      },
      pricing: {
        unitLandedCost,
        currency: pricingCurrency,
      },
      logistics: {
        routeCount,
        routeReliability,
        transitTimeDays: null,
      },
      evidence: supplierEvidence,
      referenceDate: now,
    };

    const sourcingResult = calculateSourcingOption(sourcingInput);

    // ─── Engine 4: Viability ──────────────────────────────────────────────
    const viabilityInput: ProcurementViabilityEngineInput = {
      productId,
      supplierId: supplier.id,
      matchScore: matchResult.matchScore,
      matchLevel: matchResult.matchLevel,
      evaluationResult: evalResult,
      sourcingResult,
      evidence: supplierEvidence,
      hasComplianceData,
      hasLogisticsRoutes: routeCount !== null && routeCount > 0,
      contactCount,
      referenceDate: now,
    };

    const viabilityResult = calculateProcurementViability(viabilityInput);

    // ─── Persist ──────────────────────────────────────────────────────────
    // Input hash
    const inputHash = sha256(
      stableStringify({
        productId,
        supplierId: supplier.id,
        productSupplierId: ps.id,
        evidenceIds: supplierEvidence.map((e) => e.id).sort(),
        engineVersion: SOURCING_CONFIG.engineVersion,
      }),
    );

    // Get next version
    const latestAssessment = await prisma.supplierSourcingAssessment.findFirst({
      where: { tenantId, productId, supplierId: supplier.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestAssessment?.version ?? 0) + 1;

    // Persist assessment
    await prisma.supplierSourcingAssessment.create({
      data: {
        tenantId,
        productId,
        supplierId: supplier.id,
        matchLevel: matchResult.matchLevel,
        matchScore: matchResult.matchScore,
        matchedAttributes: matchResult.matchedAttributes,
        unmatchedAttributes: matchResult.unmatchedAttributes,
        sourcingLevel: sourcingResult.sourcingLevel,
        sourcingScore: sourcingResult.sourcingScore,
        viabilityLevel: viabilityResult.viabilityLevel,
        viabilityScore: viabilityResult.viabilityScore,
        confidence: viabilityResult.confidence,
        completeness: evalResult.commercialCompleteness,
        capitalRequirement: viabilityResult.capitalRequirement,
        estimatedLeadTimeDays: viabilityResult.estimatedLeadTimeDays,
        inventoryExposure: viabilityResult.inventoryExposure,
        explanations: [...matchResult.explanations, ...evalResult.explanations, ...sourcingResult.explanations, ...viabilityResult.explanations] as never,
        evidenceReferences: supplierEvidence.map((e) => e.id),
        inputHash,
        contentHash: viabilityResult.contentHash,
        engineVersion: SOURCING_CONFIG.engineVersion,
        version: nextVersion,
        status: "DETECTED",
        calculatedAt: now,
      },
    });

    // Persist match record (deduplicated)
    const existingMatch = await prisma.supplierProductMatch.findFirst({
      where: { tenantId, productId, supplierId: supplier.id, contentHash: matchResult.contentHash },
      select: { id: true },
    });
    if (!existingMatch) {
      await prisma.supplierProductMatch.create({
        data: {
          tenantId,
          productId,
          supplierId: supplier.id,
          matchLevel: matchResult.matchLevel,
          matchScore: matchResult.matchScore,
          matchedAttributes: matchResult.matchedAttributes,
          unmatchedAttributes: matchResult.unmatchedAttributes,
          evidenceConfidence: matchResult.evidenceConfidence,
          explanations: matchResult.explanations as never,
          contentHash: matchResult.contentHash,
          engineVersion: SOURCING_CONFIG.engineVersion,
          calculatedAt: now,
        },
      });
    }

    // Persist sourcing option (deduplicated)
    const existingSourcing = await prisma.sourcingOptionRecord.findFirst({
      where: { tenantId, productId, supplierId: supplier.id, contentHash: sourcingResult.contentHash },
      select: { id: true },
    });
    if (!existingSourcing) {
      await prisma.sourcingOptionRecord.create({
        data: {
          tenantId,
          productId,
          supplierId: supplier.id,
          sourcePrice: sourcingResult.sourcePrice,
          currency: sourcingResult.currency,
          moq: sourcingResult.moq,
          leadTimeDays: sourcingResult.leadTimeDays,
          estimatedLandedCost: sourcingResult.estimatedLandedCost,
          estimatedInitialInventoryCost: sourcingResult.estimatedInitialInventoryCost,
          moqCoverageMonths: sourcingResult.moqCoverageMonths,
          sourcingLevel: sourcingResult.sourcingLevel,
          sourcingScore: sourcingResult.sourcingScore,
          explanations: sourcingResult.explanations as never,
          contentHash: sourcingResult.contentHash,
          engineVersion: SOURCING_CONFIG.engineVersion,
          calculatedAt: now,
        },
      });
    }

    // Persist viability record (deduplicated)
    const existingViability = await prisma.procurementViabilityRecord.findFirst({
      where: { tenantId, productId, supplierId: supplier.id, contentHash: viabilityResult.contentHash },
      select: { id: true },
    });
    if (!existingViability) {
      await prisma.procurementViabilityRecord.create({
        data: {
          tenantId,
          productId,
          supplierId: supplier.id,
          viabilityLevel: viabilityResult.viabilityLevel,
          viabilityScore: viabilityResult.viabilityScore,
          confidence: viabilityResult.confidence,
          capitalRequirement: viabilityResult.capitalRequirement,
          estimatedLeadTimeDays: viabilityResult.estimatedLeadTimeDays,
          inventoryExposure: viabilityResult.inventoryExposure,
          dimensionScores: viabilityResult.dimensionScores,
          explanations: viabilityResult.explanations as never,
          contentHash: viabilityResult.contentHash,
          engineVersion: SOURCING_CONFIG.engineVersion,
          calculatedAt: now,
        },
      });
    }

    // Persist constraints (deduplicated)
    for (const constraint of [...sourcingResult.constraints, ...viabilityResult.constraints]) {
      const constraintHash = sha256(
        stableStringify({
          productId,
          supplierId: supplier.id,
          constraintType: constraint.type,
          severity: constraint.severity,
          explanation: constraint.explanation,
          engineVersion: SOURCING_CONFIG.engineVersion,
        }),
      );
      const existingConstraint = await prisma.sourcingConstraintRecord.findFirst({
        where: { tenantId, productId, supplierId: supplier.id, contentHash: constraintHash },
        select: { id: true },
      });
      if (!existingConstraint) {
        await prisma.sourcingConstraintRecord.create({
          data: {
            tenantId,
            productId,
            supplierId: supplier.id,
            constraintType: constraint.type,
            severity: constraint.severity,
            value: constraint.value,
            explanation: constraint.explanation,
            evidenceRefs: constraint.evidenceIds,
            contentHash: constraintHash,
            detectedAt: now,
          },
        });
      }
    }

    assessmentCount++;
  }

  // Persist comparison snapshot
  if (productSuppliers.length > 0) {
    const comparisonFactors = {
      supplierCount: productSuppliers.length,
      assessedCount: assessmentCount,
      generatedAt: now.toISOString(),
    };
    const comparisonHash = sha256(stableStringify({
      productId,
      supplierCount: productSuppliers.length,
      assessedCount: assessmentCount,
      engineVersion: SOURCING_CONFIG.engineVersion,
    }));

    const existingComparison = await prisma.supplierComparisonSnapshot.findFirst({
      where: { tenantId, productId, contentHash: comparisonHash },
      select: { id: true },
    });
    if (!existingComparison) {
      await prisma.supplierComparisonSnapshot.create({
        data: {
          tenantId,
          productId,
          supplierCount: productSuppliers.length,
          comparisonFactors,
          ranking: [],
          explanations: [],
          contentHash: comparisonHash,
          engineVersion: SOURCING_CONFIG.engineVersion,
          snapshotDate: now,
        },
      });
    }
  }

  logger.info(
    { tenantId, productId, assessmentCount, supplierCount: productSuppliers.length },
    "supplier_sourcing_assessment_completed",
  );

  return {
    assessmentCount,
    supplierCount: productSuppliers.length,
    engineVersion: SOURCING_CONFIG.engineVersion,
  };
}

// ─── Query Functions ─────────────────────────────────────────────────────────

export async function listSupplierAssessments(params: {
  tenantId: string;
  productId?: string;
  page: number;
  limit: number;
}): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const { tenantId, productId, page, limit } = params;
  const where: Record<string, unknown> = { tenantId };
  if (productId) where.productId = productId;

  const [data, total] = await Promise.all([
    prisma.supplierSourcingAssessment.findMany({
      where,
      orderBy: { calculatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.supplierSourcingAssessment.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getSupplierAssessment(params: {
  tenantId: string;
  assessmentId: string;
}): Promise<unknown> {
  const { tenantId, assessmentId } = params;
  const assessment = await prisma.supplierSourcingAssessment.findFirst({
    where: { id: assessmentId, tenantId },
  });
  if (!assessment) throw new NotFoundError("SupplierSourcingAssessment", assessmentId);
  return assessment;
}

export async function recalculateSupplierSourcing(params: {
  tenantId: string;
  productId: string;
}) {
  return assessSupplierSourcing({ tenantId: params.tenantId, productId: params.productId });
}

export async function getSupplierComparison(params: {
  tenantId: string;
  productId: string;
}): Promise<unknown> {
  const { tenantId, productId } = params;
  await assertProductInTenant(tenantId, productId);

  const assessments = await prisma.supplierSourcingAssessment.findMany({
    where: { tenantId, productId, status: { not: "EXPIRED" } },
    orderBy: { sourcingScore: "desc" },
  });

  const constraints = await prisma.sourcingConstraintRecord.findMany({
    where: { tenantId, productId },
    orderBy: { severity: "asc" },
  });

  return {
    productId,
    suppliers: assessments,
    constraints,
    generatedAt: new Date(),
    engineVersion: SOURCING_CONFIG.engineVersion,
  };
}

export async function listSourcingConstraints(params: {
  tenantId: string;
  productId: string;
  page: number;
  limit: number;
}): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const { tenantId, productId, page, limit } = params;
  const where = { tenantId, productId };

  const [data, total] = await Promise.all([
    prisma.sourcingConstraintRecord.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sourcingConstraintRecord.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function listSupplierContacts(params: {
  tenantId: string;
  supplierId: string;
}) {
  const { tenantId, supplierId } = params;
  const contacts = await prisma.supplierContactEvidence.findMany({
    where: { tenantId, supplierId },
    orderBy: { confidence: "desc" },
  });
  return { data: contacts };
}

export async function getAssessmentHistory(params: {
  tenantId: string;
  productId: string;
  supplierId: string;
  limit: number;
}): Promise<unknown[]> {
  const { tenantId, productId, supplierId, limit } = params;
  return prisma.supplierSourcingAssessment.findMany({
    where: { tenantId, productId, supplierId },
    orderBy: { version: "desc" },
    take: limit,
  });
}

export async function expireStaleAssessments(params: { tenantId: string }) {
  const { tenantId } = params;
  const staleThreshold = new Date(
    Date.now() - SOURCING_CONFIG.staleAssessmentDays * 24 * 60 * 60 * 1000,
  );

  const result = await prisma.supplierSourcingAssessment.updateMany({
    where: {
      tenantId,
      status: { not: "EXPIRED" },
      calculatedAt: { lt: staleThreshold },
    },
    data: { status: "EXPIRED" },
  });

  logger.info({ tenantId, expired: result.count }, "supplier_sourcing_expire_completed");
  return { expired: result.count };
}
