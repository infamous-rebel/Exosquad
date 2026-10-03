// =============================================================================
// Claims Service — Phase 6
// =============================================================================
// Business logic for creating and querying evidence-backed claims.
// Claims represent structured statements like "Seller A sells Product B".
// =============================================================================

import { prisma } from "@exosquad/database";
import type { Claim, Prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import type { PaginatedResult } from "@exosquad/common";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateClaimInput {
  tenantId: string;
  subjectType: string;
  subjectId: string;
  predicate: string;
  objectType?: string;
  objectId?: string;
  value?: unknown;
  claimType: string;
  status?: string;
  confidence?: number;
  observationStatus?: string;
  validFrom?: Date;
  validUntil?: Date;
  observedAt?: Date;
  evidenceIds?: string[];
}

export interface ClaimQueryParams {
  tenantId: string;
  subjectType?: string;
  subjectId?: string;
  predicate?: string;
  claimType?: string;
  status?: string;
  observationStatus?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ─── Create Claim ────────────────────────────────────────────────────────────

/**
 * Create a claim backed by one or more evidence records.
 */
export async function createClaim(input: CreateClaimInput): Promise<Claim> {
  const claim = await prisma.claim.create({
    data: {
      tenantId: input.tenantId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      predicate: input.predicate,
      objectType: input.objectType,
      objectId: input.objectId,
      value: input.value ?? undefined,
      claimType: input.claimType,
      status: input.status ?? "active",
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.5)),
      observationStatus: input.observationStatus ?? "observed",
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      observedAt: input.observedAt ?? new Date(),
      evidence: input.evidenceIds?.length
        ? { connect: input.evidenceIds.map((id) => ({ id })) }
        : undefined,
    },
  });

  logger.info(
    { claimId: claim.id, claimType: claim.claimType, tenantId: input.tenantId },
    "Claim created"
  );

  return claim;
}

// ─── Query Claims ────────────────────────────────────────────────────────────

export async function queryClaims(
  params: ClaimQueryParams
): Promise<PaginatedResult<Claim>> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);

  const where: Prisma.ClaimWhereInput = {
    tenantId: params.tenantId,
  };

  if (params.subjectType) where.subjectType = params.subjectType;
  if (params.subjectId) where.subjectId = params.subjectId;
  if (params.predicate) where.predicate = params.predicate;
  if (params.claimType) where.claimType = params.claimType;
  if (params.status) where.status = params.status;
  if (params.observationStatus) where.observationStatus = params.observationStatus;

  const orderBy: Prisma.ClaimOrderByWithRelationInput = {};
  const sortField = params.sortBy ?? "createdAt";
  const sortOrder = params.sortOrder ?? "desc";
  (orderBy as Record<string, string>)[sortField] = sortOrder;

  const [data, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        evidence: {
          select: {
            id: true,
            evidenceType: true,
            title: true,
            confidence: true,
            status: true,
            observationStatus: true,
            observedAt: true,
          },
          take: 10,
        },
        _count: { select: { evidence: true } },
      },
    }),
    prisma.claim.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get Claim by ID ─────────────────────────────────────────────────────────

export async function getClaimById(
  tenantId: string,
  claimId: string
): Promise<Claim | null> {
  return prisma.claim.findFirst({
    where: { id: claimId, tenantId },
    include: {
      evidence: {
        select: {
          id: true,
          evidenceType: true,
          title: true,
          confidence: true,
          status: true,
          observationStatus: true,
          observedAt: true,
          sourceUrl: true,
          sourcePath: true,
        },
        orderBy: { observedAt: "desc" },
      },
      _count: { select: { evidence: true } },
    },
  });
}
