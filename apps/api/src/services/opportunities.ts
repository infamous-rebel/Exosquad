// =============================================================================
// API — Opportunity Query Service (Phase 8)
// =============================================================================
// Provides query access to opportunities with filtering, pagination,
// tenant isolation, and provenance chain resolution.
// =============================================================================

import { prisma, type Prisma } from "@exosquad/database";
import { NotFoundError, type PaginatedResult } from "@exosquad/common";

// ─── Query Types ─────────────────────────────────────────────────────────────

export interface OpportunityQueryInput {
  tenantId: string;
  status?: string;
  opportunityType?: string;
  productId?: string;
  productVariantId?: string;
  geographyCode?: string;
  minScore?: number;
  minConfidence?: number;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ─── List Opportunities ──────────────────────────────────────────────────────

export async function listOpportunities(
  input: OpportunityQueryInput
): Promise<PaginatedResult<{
  id: string;
  tenantId: string;
  productId: string | null;
  productVariantId: string | null;
  geographyCode: string | null;
  opportunityType: string;
  status: string;
  score: number;
  confidence: number;
  title: string;
  summary: string;
  detectedAt: Date;
  validFrom: Date;
  validUntil: Date | null;
  algorithmVersion: string;
  createdAt: Date;
}>> {
  const {
    tenantId,
    page = 1,
    limit = 20,
    sortBy = "detectedAt",
    sortOrder = "desc",
    ...filters
  } = input;

  const where: Prisma.OpportunityWhereInput = { tenantId };

  if (filters.status) where.status = filters.status as Prisma.EnumOpportunityStatusFilter;
  if (filters.opportunityType) where.opportunityType = filters.opportunityType;
  if (filters.productId) where.productId = filters.productId;
  if (filters.productVariantId) where.productVariantId = filters.productVariantId;
  if (filters.geographyCode) where.geographyCode = filters.geographyCode;
  if (filters.minScore !== undefined || filters.minConfidence !== undefined) {
    if (filters.minScore !== undefined) where.score = { gte: filters.minScore };
    if (filters.minConfidence !== undefined) where.confidence = { gte: filters.minConfidence };
  }
  if (filters.from || filters.to) {
    where.detectedAt = {};
    if (filters.from) where.detectedAt.gte = filters.from;
    if (filters.to) where.detectedAt.lte = filters.to;
  }

  const [data, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.opportunity.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Get Opportunity by ID ───────────────────────────────────────────────────

export async function getOpportunityById(tenantId: string, id: string) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, tenantId },
    include: {
      calculations: { orderBy: { calculatedAt: "desc" }, take: 1 },
      evidence: { orderBy: { createdAt: "desc" } },
      risks: { orderBy: { createdAt: "desc" } },
      actions: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!opportunity) {
    throw new NotFoundError("Opportunity", id);
  }

  return opportunity;
}

// ─── Get Opportunity Evidence ────────────────────────────────────────────────

export async function getOpportunityEvidence(tenantId: string, opportunityId: string) {
  // Verify opportunity belongs to tenant
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, tenantId },
    select: { id: true },
  });

  if (!opportunity) {
    throw new NotFoundError("Opportunity", opportunityId);
  }

  return prisma.opportunityEvidence.findMany({
    where: { opportunityId },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Get Opportunity Risks ───────────────────────────────────────────────────

export async function getOpportunityRisks(tenantId: string, opportunityId: string) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, tenantId },
    select: { id: true },
  });

  if (!opportunity) {
    throw new NotFoundError("Opportunity", opportunityId);
  }

  return prisma.opportunityRisk.findMany({
    where: { opportunityId },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Get Opportunity Actions ─────────────────────────────────────────────────

export async function getOpportunityActions(tenantId: string, opportunityId: string) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, tenantId },
    select: { id: true },
  });

  if (!opportunity) {
    throw new NotFoundError("Opportunity", opportunityId);
  }

  return prisma.opportunityAction.findMany({
    where: { opportunityId },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Get Opportunity Calculation ─────────────────────────────────────────────

export async function getOpportunityCalculation(tenantId: string, calculationId: string) {
  const calculation = await prisma.opportunityCalculation.findFirst({
    where: { id: calculationId },
    include: {
      opportunity: {
        select: { id: true, tenantId: true },
      },
    },
  });

  if (!calculation || calculation.opportunity.tenantId !== tenantId) {
    throw new NotFoundError("OpportunityCalculation", calculationId);
  }

  return calculation;
}

// ─── Opportunity Summary ─────────────────────────────────────────────────────

export async function getOpportunitySummary(tenantId: string) {
  const [
    total,
    actionable,
    watch,
    detected,
    expired,
    byType,
    byGeography,
    avgConfidenceResult,
    avgScoreResult,
  ] = await Promise.all([
    prisma.opportunity.count({ where: { tenantId } }),
    prisma.opportunity.count({ where: { tenantId, status: "ACTIONABLE" } }),
    prisma.opportunity.count({ where: { tenantId, status: "WATCH" } }),
    prisma.opportunity.count({ where: { tenantId, status: "DETECTED" } }),
    prisma.opportunity.count({ where: { tenantId, status: "EXPIRED" } }),
    prisma.opportunity.groupBy({
      by: ["opportunityType"],
      where: { tenantId },
      _count: { id: true },
    }),
    prisma.opportunity.groupBy({
      by: ["geographyCode"],
      where: { tenantId },
      _count: { id: true },
    }),
    prisma.opportunity.aggregate({
      where: { tenantId },
      _avg: { confidence: true },
    }),
    prisma.opportunity.aggregate({
      where: { tenantId },
      _avg: { score: true },
    }),
  ]);

  return {
    total,
    actionable,
    watch,
    detected,
    expired,
    averageConfidence: avgConfidenceResult._avg.confidence ?? 0,
    averageScore: avgScoreResult._avg.score ?? 0,
    byType: byType.map((t) => ({
      type: t.opportunityType,
      count: t._count.id,
    })),
    byGeography: byGeography.map((g) => ({
      geography: g.geographyCode ?? "global",
      count: g._count.id,
    })),
  };
}
