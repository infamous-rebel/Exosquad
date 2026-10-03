// =============================================================================
// API — Authenticity Intelligence Service (Phase 8 — Original Roadmap)
// =============================================================================
// Orchestrator that loads subject data, evidence, and source metadata from
// the database, runs the pure calculation engine, and persists results
// atomically with full provenance.
// =============================================================================

import { prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import { NotFoundError, ValidationError } from "@exosquad/common";
import {
  calculateAuthenticity,
  type AuthenticityEngineInput,
  type AuthenticityEngineResult,
  type EvidenceSummary,
  type SubjectData,
  type SourceMetadata,
} from "./authenticity-engine.js";

// ─── Assessment Input ────────────────────────────────────────────────────────

export interface AssessInput {
  tenantId: string;
  subjectType: string;
  subjectId: string;
}

// ─── Load Subject Data ───────────────────────────────────────────────────────

async function loadSubjectData(
  tenantId: string,
  subjectType: string,
  subjectId: string
): Promise<SubjectData> {
  const subject: SubjectData = { tenantId, subjectType, subjectId };

  switch (subjectType) {
    case "PRODUCT": {
      const product = await prisma.product.findFirst({
        where: { id: subjectId, tenantId },
        include: {
          brand: true,
          identifiers: { take: 10 },
          variants: { take: 5 },
        },
      });
      if (!product) throw new NotFoundError("Product", subjectId);

      subject.productName = product.name;
      subject.normalizedProductName = product.normalizedName;
      subject.brandId = product.brandId;
      subject.brandName = product.brand?.name ?? null;
      subject.countryOfOrigin = product.countryOfOrigin;
      subject.description = product.description;
      subject.attributes = product.attributes as Record<string, unknown>;

      // Extract identifiers
      const gtin = product.identifiers.find(
        (i) => i.type === "gtin13" || i.type === "ean" || i.type === "upc"
      );
      const sku = product.identifiers.find((i) => i.type === "sku");
      const mpn = product.identifiers.find((i) => i.type === "mpn");
      subject.gtin = gtin?.normalized ?? null;
      subject.sku = sku?.normalized ?? null;
      subject.mpn = mpn?.normalized ?? null;
      break;
    }

    case "SELLER": {
      const seller = await prisma.seller.findFirst({
        where: { id: subjectId, tenantId },
      });
      if (!seller) throw new NotFoundError("Seller", subjectId);

      subject.sellerName = seller.name;
      subject.sellerDomain = seller.domain;
      subject.sellerCountry = seller.country;
      subject.sellerRating = seller.rating ? Number(seller.rating) : null;
      subject.sellerReviewCount = seller.reviewCount;
      break;
    }

    case "SUPPLIER": {
      const supplier = await prisma.supplier.findFirst({
        where: { id: subjectId, tenantId },
      });
      if (!supplier) throw new NotFoundError("Supplier", subjectId);

      subject.supplierName = supplier.name;
      subject.supplierDomain = supplier.domain;
      subject.supplierCountry = supplier.country;
      subject.supplierRole = supplier.supplierRole;
      break;
    }

    case "BRAND": {
      const brand = await prisma.brand.findFirst({
        where: { id: subjectId, tenantId },
      });
      if (!brand) throw new NotFoundError("Brand", subjectId);

      subject.brandId = brand.id;
      subject.brandName = brand.name;
      break;
    }

    case "SKU":
    case "LISTING":
    case "DOCUMENT":
      // These subject types use generic evidence-based assessment
      break;

    default:
      throw new ValidationError(`Unsupported subject type: ${subjectType}`);
  }

  return subject;
}

// ─── Load Evidence ───────────────────────────────────────────────────────────

async function loadEvidence(
  tenantId: string,
  subjectType: string,
  subjectId: string
): Promise<EvidenceSummary[]> {
  // Build the where clause based on subject type
  const where: Record<string, unknown> = { tenantId };

  switch (subjectType) {
    case "PRODUCT":
      where.OR = [
        { entityType: "product", entityId: subjectId },
        { productId: subjectId },
      ];
      break;
    case "SELLER":
      where.OR = [
        { entityType: "seller", entityId: subjectId },
        { productSeller: { sellerId: subjectId } },
      ];
      break;
    case "SUPPLIER":
      where.OR = [
        { entityType: "supplier", entityId: subjectId },
        { productSupplier: { supplierId: subjectId } },
      ];
      break;
    case "BRAND":
      where.entityType = "brand";
      where.entityId = subjectId;
      break;
    default:
      where.OR = [
        { entityType: subjectType.toLowerCase(), entityId: subjectId },
        { entityId: subjectId },
      ];
  }

  const evidenceRecords = await prisma.evidence.findMany({
    where: where as any,
    orderBy: { observedAt: "desc" },
    take: 200, // Limit to prevent memory issues
  });

  return evidenceRecords.map((e) => ({
    id: e.id,
    sourceId: e.sourceId,
    evidenceType: e.evidenceType,
    entityType: e.entityType,
    entityId: e.entityId,
    confidence: e.confidence,
    status: e.status,
    freshness: e.freshness,
    contentHash: e.contentHash,
    extractedValue: e.extractedValue as Record<string, unknown> | null,
    normalizedValue: e.normalizedValue as Record<string, unknown> | null,
    observedAt: e.observedAt,
  }));
}

// ─── Load Source Metadata ────────────────────────────────────────────────────

async function loadSourceMetadata(
  tenantId: string,
  sourceIds: string[]
): Promise<SourceMetadata[]> {
  if (sourceIds.length === 0) return [];

  const sources = await prisma.source.findMany({
    where: { tenantId, id: { in: sourceIds } },
    select: {
      id: true,
      type: true,
      healthStatus: true,
      totalFetched: true,
      consecutiveErrors: true,
    },
  });

  return sources.map((s) => ({
    sourceId: s.id,
    type: s.type,
    healthStatus: s.healthStatus,
    totalFetched: s.totalFetched,
    consecutiveErrors: s.consecutiveErrors,
  }));
}

// ─── Load Conflicts ──────────────────────────────────────────────────────────

async function loadConflicts(
  tenantId: string,
  subjectType: string,
  subjectId: string
): Promise<AuthenticityEngineInput["conflicts"]> {
  const entityType = subjectType.toLowerCase();

  const conflicts = await prisma.evidenceConflict.findMany({
    where: {
      tenantId,
      entityType,
      entityId: subjectId,
    },
    take: 50,
  });

  return conflicts.map((c) => ({
    id: c.id,
    conflictType: c.conflictType,
    description: c.description,
    status: c.status,
    supportingEvidenceId: c.supportingEvidenceId,
    contradictingEvidenceId: c.contradictingEvidenceId,
  }));
}

// ─── Persist Assessment ──────────────────────────────────────────────────────

async function persistAssessment(
  result: AuthenticityEngineResult
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Check for existing assessment with same input hash (deduplication)
    const existing = await tx.authenticityAssessment.findUnique({
      where: {
        tenantId_subjectType_subjectId_inputHash: {
          tenantId: result.tenantId,
          subjectType: result.subjectType,
          subjectId: result.subjectId,
          inputHash: result.inputHash,
        },
      },
    });

    if (existing) {
      // Same input already assessed — return existing assessment ID
      return existing.id;
    }

    // Create the assessment
    const assessment = await tx.authenticityAssessment.create({
      data: {
        tenantId: result.tenantId,
        subjectType: result.subjectType,
        subjectId: result.subjectId,
        status: result.status as any,
        score: result.score,
        confidence: result.confidence,
        algorithmVersion: result.algorithmVersion,
        inputHash: result.inputHash,
        calculationHash: result.calculationHash,
        evidenceCount: result.evidenceCount,
        signalCount: result.signalCount,
        contradictionCount: result.contradictionCount,
        positiveSignalCount: result.positiveSignalCount,
        negativeSignalCount: result.negativeSignalCount,
        dataCompleteness: result.dataCompleteness,
        sourceDiversity: result.sourceDiversity,
        assessedAt: new Date(),
      },
    });

    // Persist signals
    if (result.signals.length > 0) {
      await tx.authenticitySignal.createMany({
        data: result.signals.map((s) => ({
          tenantId: result.tenantId,
          assessmentId: assessment.id,
          signalType: s.signalType,
          direction: s.direction,
          score: s.score,
          weight: s.weight,
          confidence: s.confidence,
          subjectType: s.subjectType,
          subjectId: s.subjectId,
          evidenceId: s.evidenceId,
          metadata: s.metadata as any,
        })),
      });
    }

    // Persist evidence links
    if (result.evidenceIds.length > 0) {
      const evidenceLinks = result.evidenceIds.map((evidenceId) => {
        const signal = result.signals.find((s) => s.evidenceId === evidenceId);
        const direction = signal?.direction ?? "UNKNOWN";

        return {
          tenantId: result.tenantId,
          assessmentId: assessment.id,
          evidenceId,
          evidenceRole:
            direction === "POSITIVE"
              ? "SUPPORTING"
              : direction === "NEGATIVE"
                ? "CONTRADICTING"
                : "CONTEXTUAL",
          evidenceStrength: "MODERATE" as string,
          relevance: signal?.score ?? 0.5,
          effect:
            direction === "POSITIVE"
              ? signal?.score ?? 0.5
              : direction === "NEGATIVE"
                ? -(signal?.score ?? 0.5)
                : 0,
          observedAt: new Date(),
        };
      });

      await tx.authenticityEvidenceLink.createMany({
        data: evidenceLinks,
        skipDuplicates: true,
      });
    }

    // Persist risks
    if (result.risks.length > 0) {
      await tx.authenticityRisk.createMany({
        data: result.risks.map((r) => ({
          tenantId: result.tenantId,
          assessmentId: assessment.id,
          riskType: r.riskType,
          severity: r.severity,
          score: r.score,
          title: r.title,
          description: r.description,
          evidence: r.evidence as any,
        })),
      });
    }

    // Persist the decision snapshot
    await tx.authenticityDecision.create({
      data: {
        assessmentId: assessment.id,
        algorithmVersion: result.algorithmVersion,
        identityScore: result.scoreBreakdown.identityScore,
        brandScore: result.scoreBreakdown.brandScore,
        sellerScore: result.scoreBreakdown.sellerScore,
        supplierScore: result.scoreBreakdown.supplierScore,
        listingScore: result.scoreBreakdown.listingScore,
        documentScore: result.scoreBreakdown.documentScore,
        priceScore: result.scoreBreakdown.priceScore,
        corroborationScore: result.scoreBreakdown.corroborationScore,
        evidenceQuantityScore: result.confidenceBreakdown.evidenceQuantityScore,
        evidenceQualityScore: result.confidenceBreakdown.evidenceQualityScore,
        independenceScore: result.confidenceBreakdown.independenceScore,
        completenessScore: result.confidenceBreakdown.completenessScore,
        consistencyScore: result.confidenceBreakdown.consistencyScore,
        contradictionPenalty: result.scoreBreakdown.contradictionPenalty,
        finalScore: result.score,
        finalConfidence: result.confidence,
        inputHash: result.inputHash,
        evidenceIds: result.evidenceIds,
        signalIds: result.signals.map((_, i) => `signal-${i}`),
      },
    });

    return assessment.id;
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run a complete authenticity assessment for a subject.
 */
export async function assessAuthenticity(
  input: AssessInput
): Promise<AuthenticityEngineResult & { assessmentId: string }> {
  const { tenantId, subjectType, subjectId } = input;

  logger.info(
    { tenantId, subjectType, subjectId },
    "authenticity_assessment_started"
  );

  // 1. Load subject data
  const subject = await loadSubjectData(tenantId, subjectType, subjectId);

  // 2. Load evidence
  const evidence = await loadEvidence(tenantId, subjectType, subjectId);

  // 3. Load source metadata
  const sourceIds = [...new Set(evidence.map((e) => e.sourceId).filter(Boolean))] as string[];
  const sources = await loadSourceMetadata(tenantId, sourceIds);

  // 4. Load conflicts
  const conflicts = await loadConflicts(tenantId, subjectType, subjectId);

  // 5. Run pure calculation engine
  const engineInput: AuthenticityEngineInput = {
    tenantId,
    subject,
    evidence,
    sources,
    conflicts,
  };

  const result = calculateAuthenticity(engineInput);

  // 6. Persist atomically
  const assessmentId = await persistAssessment(result);

  logger.info(
    {
      tenantId,
      subjectType,
      subjectId,
      assessmentId,
      score: result.score,
      confidence: result.confidence,
      status: result.status,
      signalCount: result.signalCount,
      evidenceCount: result.evidenceCount,
    },
    "authenticity_assessment_completed"
  );

  return { ...result, assessmentId };
}

/**
 * Get an assessment by ID with tenant isolation.
 */
export async function getAssessment(tenantId: string, assessmentId: string): Promise<any> {
  const assessment = await prisma.authenticityAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    include: {
      signals: { orderBy: { createdAt: "asc" } },
      risks: { orderBy: { severity: "desc" } },
      evidenceLinks: {
        include: {},
        orderBy: { createdAt: "asc" },
        take: 100,
      },
      decisions: { orderBy: { calculatedAt: "desc" }, take: 1 },
    },
  });

  if (!assessment) throw new NotFoundError("AuthenticityAssessment", assessmentId);

  return assessment;
}

/**
 * List assessments with filtering and pagination.
 */
export async function listAssessments(params: {
  tenantId: string;
  subjectType?: string;
  subjectId?: string;
  status?: string;
  minScore?: number;
  minConfidence?: number;
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder: "asc" | "desc";
}) {
  const where: Record<string, unknown> = { tenantId: params.tenantId };

  if (params.subjectType) where.subjectType = params.subjectType;
  if (params.subjectId) where.subjectId = params.subjectId;
  if (params.status) where.status = params.status;
  if (params.minScore != null) where.score = { gte: params.minScore };
  if (params.minConfidence != null) {
    const existing = where.confidence as Record<string, unknown> | undefined;
    where.confidence = { ...existing, gte: params.minConfidence };
  }

  const [data, total] = await Promise.all([
    prisma.authenticityAssessment.findMany({
      where: where as any,
      orderBy: { [params.sortBy ?? "assessedAt"]: params.sortOrder },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.authenticityAssessment.count({ where: where as any }),
  ]);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    },
  };
}

/**
 * Get signals for an assessment.
 */
export async function getAssessmentSignals(tenantId: string, assessmentId: string): Promise<any[]> {
  // Verify assessment belongs to tenant
  const assessment = await prisma.authenticityAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    select: { id: true },
  });
  if (!assessment) throw new NotFoundError("AuthenticityAssessment", assessmentId);

  return prisma.authenticitySignal.findMany({
    where: { assessmentId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Get evidence links for an assessment.
 */
export async function getAssessmentEvidence(tenantId: string, assessmentId: string): Promise<any[]> {
  const assessment = await prisma.authenticityAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    select: { id: true },
  });
  if (!assessment) throw new NotFoundError("AuthenticityAssessment", assessmentId);

  return prisma.authenticityEvidenceLink.findMany({
    where: { assessmentId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Get risks for an assessment.
 */
export async function getAssessmentRisks(tenantId: string, assessmentId: string): Promise<any[]> {
  const assessment = await prisma.authenticityAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    select: { id: true },
  });
  if (!assessment) throw new NotFoundError("AuthenticityAssessment", assessmentId);

  return prisma.authenticityRisk.findMany({
    where: { assessmentId },
    orderBy: { severity: "desc" },
  });
}

/**
 * Get decision history for an assessment.
 */
export async function getAssessmentHistory(tenantId: string, assessmentId: string): Promise<any[]> {
  const assessment = await prisma.authenticityAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    select: { id: true },
  });
  if (!assessment) throw new NotFoundError("AuthenticityAssessment", assessmentId);

  return prisma.authenticityDecision.findMany({
    where: { assessmentId },
    orderBy: { calculatedAt: "desc" },
  });
}

/**
 * Get provenance chain for an assessment.
 */
export async function getAssessmentProvenance(tenantId: string, assessmentId: string) {
  const assessment = await prisma.authenticityAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    include: {
      signals: { select: { id: true, signalType: true, evidenceId: true } },
      evidenceLinks: { select: { evidenceId: true, evidenceRole: true } },
    },
  });
  if (!assessment) throw new NotFoundError("AuthenticityAssessment", assessmentId);

  // Build provenance chain: Assessment → Signals → Evidence → Sources
  const evidenceIds = [
    ...new Set(assessment.signals.map((s) => s.evidenceId).filter(Boolean)),
    ...assessment.evidenceLinks.map((l) => l.evidenceId),
  ] as string[];

  const evidenceRecords = evidenceIds.length > 0
    ? await prisma.evidence.findMany({
        where: { id: { in: evidenceIds }, tenantId },
        select: {
          id: true,
          sourceId: true,
          observationId: true,
          evidenceType: true,
          title: true,
          entityType: true,
          entityId: true,
        },
      })
    : [];

  const sourceIds = [...new Set(evidenceRecords.map((e) => e.sourceId).filter(Boolean))] as string[];
  const sources = sourceIds.length > 0
    ? await prisma.source.findMany({
        where: { id: { in: sourceIds }, tenantId },
        select: { id: true, name: true, type: true },
      })
    : [];

  return {
    assessment: {
      id: assessment.id,
      subjectType: assessment.subjectType,
      subjectId: assessment.subjectId,
      status: assessment.status,
      score: assessment.score,
      confidence: assessment.confidence,
      algorithmVersion: assessment.algorithmVersion,
    },
    signals: assessment.signals.map((s) => ({
      id: s.id,
      signalType: s.signalType,
      evidenceId: s.evidenceId,
    })),
    evidence: evidenceRecords,
    sources,
    provenanceChain: {
      assessmentId: assessment.id,
      signalCount: assessment.signals.length,
      evidenceCount: evidenceRecords.length,
      sourceCount: sources.length,
    },
  };
}

/**
 * Recalculate an existing assessment with fresh evidence.
 */
export async function recalculateAssessment(
  tenantId: string,
  assessmentId: string
): Promise<AuthenticityEngineResult & { assessmentId: string }> {
  // Verify the existing assessment
  const existing = await prisma.authenticityAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    select: { subjectType: true, subjectId: true },
  });
  if (!existing) throw new NotFoundError("AuthenticityAssessment", assessmentId);

  // Re-run assessment (creates a new assessment record — does NOT overwrite)
  return assessAuthenticity({
    tenantId,
    subjectType: existing.subjectType,
    subjectId: existing.subjectId,
  });
}
