// =============================================================================
// Worker — Supplier Sourcing Intelligence Processor (Phase 13)
// =============================================================================
// Processes supplier sourcing assessment, recalculation, refresh, and
// expiration jobs. Self-contained — does not import API-layer code.
// =============================================================================

import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { SOURCING_CONFIG } from "@exosquad/common";

// ─── Job Data Types ──────────────────────────────────────────────────────────

interface SourcingAssessJob {
  type: "supplier-sourcing:assess";
  tenantId: string;
  productId: string;
  triggeredBy: string;
}

interface SourcingRecalculateJob {
  type: "supplier-sourcing:recalculate";
  tenantId: string;
  assessmentId: string;
  triggeredBy: string;
}

interface SourcingRefreshJob {
  type: "supplier-sourcing:refresh";
  tenantId: string;
  triggeredBy: string;
}

interface SourcingExpireJob {
  type: "supplier-sourcing:expire";
  tenantId: string;
  triggeredBy: string;
}

type SourcingJob =
  | SourcingAssessJob
  | SourcingRecalculateJob
  | SourcingRefreshJob
  | SourcingExpireJob;

const STALE_ASSESSMENT_DAYS = SOURCING_CONFIG.staleAssessmentDays;

// ─── Content Hash Helpers ────────────────────────────────────────────────────

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

// ─── Engine Imports (included via tsconfig for self-contained worker) ────────
// The worker includes the engine source files via tsconfig to avoid
// cross-package imports, following the Phase 12 pattern.

import { calculateSupplierMatch, type SupplierMatchEngineInput, type EvidenceRef } from "../../../api/src/services/supplier-matching-engine.js";
import { calculateSupplierEvaluation, type SupplierEvaluationEngineInput } from "../../../api/src/services/supplier-evaluation-engine.js";
import { calculateSourcingOption, type SourcingEngineInput } from "../../../api/src/services/sourcing-engine.js";
import { calculateProcurementViability, type ProcurementViabilityEngineInput } from "../../../api/src/services/procurement-viability-engine.js";

// ─── Assessment Core ─────────────────────────────────────────────────────────

async function runAssessment(tenantId: string, productId: string): Promise<void> {
  const now = new Date();

  // 1. Load product
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    include: { identifiers: true, brand: true, category: true },
  });
  if (!product) {
    logger.warn({ tenantId, productId }, "supplier_sourcing_product_not_found");
    return;
  }

  // 2. Load supplier candidates
  const productSuppliers = await prisma.productSupplier.findMany({
    where: { tenantId, productId },
    include: { supplier: true },
    take: 50,
  });

  if (productSuppliers.length === 0) {
    logger.info({ tenantId, productId }, "supplier_sourcing_no_suppliers_found");
    return;
  }

  // 3. Load evidence
  const evidence = await prisma.evidence.findMany({
    where: { tenantId, productId, status: "active" },
    take: 100,
  });

  // 4. Load Phase 7–11 data
  const demandCalcs = await prisma.demandCalculation.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const landedCosts = await prisma.landedCostCalculation.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const logisticsLegs = await prisma.logisticsLeg.findMany({
    where: { tenantId },
    take: 50,
  });

  // 5. Load contacts
  const supplierContacts = await prisma.supplierContactEvidence.findMany({
    where: { tenantId },
    take: 200,
  });

  // Build evidence map per supplier
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

  // Phase 7 demand
  const estimatedMonthlyDemand = demandCalcs.length > 0
    ? ((demandCalcs[0]?.result as Record<string, unknown>)?.velocity as number | undefined) ?? null
    : null;

  // Phase 11 pricing
  const unitLandedCost = landedCosts.length > 0
    ? (landedCosts[0]?.unitLandedCost as number | null) ?? null
    : null;
  const pricingCurrency = landedCosts.length > 0
    ? (landedCosts[0]?.currency as string | null) ?? null
    : null;

  // Phase 10 logistics
  const routeCount = logisticsLegs.length > 0 ? logisticsLegs.length : null;
  const routeReliability = logisticsLegs.length > 0
    ? logisticsLegs.reduce((s, l) => s + l.confidence, 0) / logisticsLegs.length
    : null;

  let assessmentCount = 0;

  for (const ps of productSuppliers) {
    const supplier = ps.supplier;
    const supplierEvidence = evidenceBySupplier.get(supplier.id) ?? [];
    const contactCount = supplierContacts.filter((c) => c.supplierId === supplier.id).length;
    const supplierAttrs = (supplier.attributes ?? {}) as Record<string, unknown>;

    // Engine 1: Match
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
        identifiers: product.identifiers.map((id) => ({
          type: id.type, value: id.value, normalized: id.normalized,
        })),
      },
      supplierProduct: {
        supplierProductName: (supplierAttrs.productName as string) ?? null,
        supplierNormalizedName: supplier.normalizedName,
        supplierCategory: (supplierAttrs.category as string) ?? null,
        supplierDescription: (supplierAttrs.description as string) ?? null,
        supplierCountry: supplier.country,
        supplierRole: supplier.supplierRole,
        supplierAttributes: supplierAttrs,
        supplierIdentifiers: [],
      },
      evidence: supplierEvidence,
      referenceDate: now,
    };

    const matchResult = calculateSupplierMatch(matchInput);
    if (matchResult.matchLevel === "no_match") continue;

    // Engine 2: Evaluate
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

    // Engine 3: Source
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
      demand: { estimatedMonthlyDemand, demandLevel: demandCalcs.length > 0 ? "MODERATE" : null, demandConfidence: demandCalcs.length > 0 ? 0.5 : 0 },
      pricing: { unitLandedCost, currency: pricingCurrency },
      logistics: { routeCount, routeReliability, transitTimeDays: null },
      evidence: supplierEvidence,
      referenceDate: now,
    };

    const sourcingResult = calculateSourcingOption(sourcingInput);

    // Engine 4: Viability
    const viabilityInput: ProcurementViabilityEngineInput = {
      productId,
      supplierId: supplier.id,
      matchScore: matchResult.matchScore,
      matchLevel: matchResult.matchLevel,
      evaluationResult: evalResult,
      sourcingResult,
      evidence: supplierEvidence,
      hasComplianceData: false,
      hasLogisticsRoutes: routeCount !== null && routeCount > 0,
      contactCount,
      referenceDate: now,
    };

    const viabilityResult = calculateProcurementViability(viabilityInput);

    // Persist assessment
    const inputHash = sha256(stableStringify({
      productId, supplierId: supplier.id, productSupplierId: ps.id,
      evidenceIds: supplierEvidence.map((e) => e.id).sort(),
      engineVersion: SOURCING_CONFIG.engineVersion,
    }));

    const latestAssessment = await prisma.supplierSourcingAssessment.findFirst({
      where: { tenantId, productId, supplierId: supplier.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestAssessment?.version ?? 0) + 1;

    await prisma.supplierSourcingAssessment.create({
      data: {
        tenantId, productId, supplierId: supplier.id,
        matchLevel: matchResult.matchLevel, matchScore: matchResult.matchScore,
        matchedAttributes: matchResult.matchedAttributes,
        unmatchedAttributes: matchResult.unmatchedAttributes,
        sourcingLevel: sourcingResult.sourcingLevel, sourcingScore: sourcingResult.sourcingScore,
        viabilityLevel: viabilityResult.viabilityLevel, viabilityScore: viabilityResult.viabilityScore,
        confidence: viabilityResult.confidence,
        completeness: evalResult.commercialCompleteness,
        capitalRequirement: viabilityResult.capitalRequirement,
        estimatedLeadTimeDays: viabilityResult.estimatedLeadTimeDays,
        inventoryExposure: viabilityResult.inventoryExposure,
        explanations: [...matchResult.explanations, ...evalResult.explanations, ...sourcingResult.explanations, ...viabilityResult.explanations] as never,
        evidenceReferences: supplierEvidence.map((e) => e.id),
        inputHash, contentHash: viabilityResult.contentHash,
        engineVersion: SOURCING_CONFIG.engineVersion,
        version: nextVersion, status: "DETECTED", calculatedAt: now,
      },
    });

    // Persist constraints (deduplicated)
    for (const constraint of [...sourcingResult.constraints, ...viabilityResult.constraints]) {
      const constraintHash = sha256(stableStringify({
        productId, supplierId: supplier.id, constraintType: constraint.type,
        severity: constraint.severity, explanation: constraint.explanation,
        engineVersion: SOURCING_CONFIG.engineVersion,
      }));
      const existing = await prisma.sourcingConstraintRecord.findFirst({
        where: { tenantId, productId, supplierId: supplier.id, contentHash: constraintHash },
        select: { id: true },
      });
      if (!existing) {
        await prisma.sourcingConstraintRecord.create({
          data: {
            tenantId, productId, supplierId: supplier.id,
            constraintType: constraint.type, severity: constraint.severity,
            value: constraint.value, explanation: constraint.explanation,
            evidenceRefs: constraint.evidenceIds, contentHash: constraintHash, detectedAt: now,
          },
        });
      }
    }

    assessmentCount++;
  }

  logger.info(
    { tenantId, productId, assessmentCount, supplierCount: productSuppliers.length },
    "supplier_sourcing_assess_completed",
  );
}

// ─── Job Handlers ────────────────────────────────────────────────────────────

async function handleAssess(job: SourcingAssessJob): Promise<void> {
  logger.info({ tenantId: job.tenantId, productId: job.productId }, "supplier_sourcing_assess_started");
  await runAssessment(job.tenantId, job.productId);
}

async function handleRecalculate(job: SourcingRecalculateJob): Promise<void> {
  const assessment = await prisma.supplierSourcingAssessment.findFirst({
    where: { id: job.assessmentId, tenantId: job.tenantId },
  });
  if (!assessment) {
    logger.warn({ tenantId: job.tenantId, assessmentId: job.assessmentId }, "supplier_sourcing_recalculate_not_found");
    return;
  }
  await runAssessment(job.tenantId, assessment.productId);
}

async function handleRefresh(job: SourcingRefreshJob): Promise<void> {
  const { tenantId } = job;
  const staleThreshold = new Date(Date.now() - STALE_ASSESSMENT_DAYS * 24 * 60 * 60 * 1000);

  const staleAssessments = await prisma.supplierSourcingAssessment.findMany({
    where: { tenantId, status: { not: "EXPIRED" }, calculatedAt: { lt: staleThreshold } },
    orderBy: { calculatedAt: "asc" },
    select: { productId: true },
    distinct: ["productId"],
    take: 50,
  });

  for (const a of staleAssessments) {
    try {
      await runAssessment(tenantId, a.productId);
    } catch (err) {
      logger.error({ tenantId, productId: a.productId, err }, "supplier_sourcing_refresh_failed");
    }
  }

  logger.info({ tenantId, refreshed: staleAssessments.length }, "supplier_sourcing_refresh_completed");
}

async function handleExpire(job: SourcingExpireJob): Promise<void> {
  const { tenantId } = job;
  const staleThreshold = new Date(Date.now() - STALE_ASSESSMENT_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.supplierSourcingAssessment.updateMany({
    where: { tenantId, status: { not: "EXPIRED" }, calculatedAt: { lt: staleThreshold } },
    data: { status: "EXPIRED" },
  });

  logger.info({ tenantId, expired: result.count }, "supplier_sourcing_expire_completed");
}

// ─── Main Processor Entry Point ──────────────────────────────────────────────

export async function processSupplierSourcingJob(job: Job): Promise<void> {
  const data = job.data as SourcingJob;
  const startTime = Date.now();

  logger.info({ type: data.type, tenantId: data.tenantId, jobId: job.id }, "supplier_sourcing_job_started");

  try {
    switch (data.type) {
      case "supplier-sourcing:assess":
        await handleAssess(data);
        break;
      case "supplier-sourcing:recalculate":
        await handleRecalculate(data);
        break;
      case "supplier-sourcing:refresh":
        await handleRefresh(data);
        break;
      case "supplier-sourcing:expire":
        await handleExpire(data);
        break;
      default:
        logger.warn({ type: (data as { type: string }).type, jobId: job.id }, "Unknown supplier sourcing job type");
    }

    const elapsed = Date.now() - startTime;
    logger.info({ type: data.type, tenantId: data.tenantId, jobId: job.id, elapsedMs: elapsed }, "supplier_sourcing_job_completed");
  } catch (err) {
    const elapsed = Date.now() - startTime;
    logger.error({ type: data.type, tenantId: data.tenantId, jobId: job.id, elapsedMs: elapsed, err }, "supplier_sourcing_job_failed");
    throw err;
  }
}
