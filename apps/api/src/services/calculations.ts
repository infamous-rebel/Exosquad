// =============================================================================
// Calculations Service — Phase 6
// =============================================================================
// Provenance tracking for computed values: average price, price trends,
// seller counts, demand signals, etc.
// =============================================================================

import { prisma } from "@exosquad/database";
import type { Calculation, Prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import type { PaginatedResult } from "@exosquad/common";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateCalculationInput {
  tenantId: string;
  calculationType: string;
  algorithm: string;
  algorithmVersion: string;
  inputs: unknown;
  outputs: unknown;
  units?: string;
  currency?: string;
  confidence?: number;
  status?: string;
  entityType: string;
  entityId: string;
  sourceId?: string;
  validFrom?: Date;
  validUntil?: Date;
  inputEvidenceIds?: string[];
}

export interface CalculationQueryParams {
  tenantId: string;
  calculationType?: string;
  entityType?: string;
  entityId?: string;
  status?: string;
  algorithm?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ─── Create Calculation ──────────────────────────────────────────────────────

export async function createCalculation(
  input: CreateCalculationInput
): Promise<Calculation> {
  const calculation = await prisma.calculation.create({
    data: {
      tenantId: input.tenantId,
      calculationType: input.calculationType,
      algorithm: input.algorithm,
      algorithmVersion: input.algorithmVersion,
      inputs: input.inputs as Prisma.InputJsonValue,
      outputs: input.outputs as Prisma.InputJsonValue,
      units: input.units,
      currency: input.currency,
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.5)),
      status: input.status ?? "active",
      entityType: input.entityType,
      entityId: input.entityId,
      sourceId: input.sourceId,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      inputEvidence: input.inputEvidenceIds?.length
        ? { connect: input.inputEvidenceIds.map((id) => ({ id })) }
        : undefined,
    },
  });

  logger.info(
    {
      calculationId: calculation.id,
      calculationType: calculation.calculationType,
      tenantId: input.tenantId,
    },
    "Calculation provenance created"
  );

  return calculation;
}

// ─── Get Calculation by ID ───────────────────────────────────────────────────

export async function getCalculationById(
  tenantId: string,
  calculationId: string
): Promise<Calculation | null> {
  return prisma.calculation.findFirst({
    where: { id: calculationId, tenantId },
    include: {
      inputEvidence: {
        select: {
          id: true,
          evidenceType: true,
          title: true,
          normalizedValue: true,
          confidence: true,
          observedAt: true,
          source: { select: { id: true, name: true } },
        },
        orderBy: { observedAt: "desc" },
      },
      outputEvidence: {
        select: {
          id: true,
          evidenceType: true,
          title: true,
          normalizedValue: true,
          confidence: true,
        },
      },
      _count: { select: { inputEvidence: true, outputEvidence: true } },
    },
  });
}

// ─── Calculation Provenance ──────────────────────────────────────────────────

export async function getCalculationProvenance(
  tenantId: string,
  calculationId: string
): Promise<{
  calculation: Calculation | null;
  inputChain: Array<Record<string, unknown>>;
  sourceChain: Array<Record<string, unknown>>;
}> {
  const calculation = await getCalculationById(tenantId, calculationId);
  if (!calculation) return { calculation: null, inputChain: [], sourceChain: [] };

  // Build input chain: evidence → observation → source
  const inputChain: Array<Record<string, unknown>> = [];
  for (const ev of (calculation as Calculation & { inputEvidence: Array<Record<string, unknown>> }).inputEvidence ?? []) {
    inputChain.push(ev);
  }

  // Build source chain from evidence source IDs
  const sourceIds = (calculation as Calculation & { inputEvidence: Array<{ sourceId?: string | null }> }).inputEvidence
    ?.map((e) => e.sourceId)
    .filter(Boolean) as string[] | undefined;

  let sourceChain: Array<Record<string, unknown>> = [];
  if (sourceIds?.length) {
    sourceChain = await prisma.source.findMany({
      where: { id: { in: sourceIds }, tenantId },
      select: { id: true, name: true, type: true, healthStatus: true, lastSuccessAt: true },
    });
  }

  return { calculation, inputChain, sourceChain };
}

// ─── Query Calculations ──────────────────────────────────────────────────────

export async function queryCalculations(
  params: CalculationQueryParams
): Promise<PaginatedResult<Calculation>> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);

  const where: Prisma.CalculationWhereInput = {
    tenantId: params.tenantId,
  };

  if (params.calculationType) where.calculationType = params.calculationType;
  if (params.entityType) where.entityType = params.entityType;
  if (params.entityId) where.entityId = params.entityId;
  if (params.status) where.status = params.status;
  if (params.algorithm) where.algorithm = params.algorithm;

  const orderBy: Prisma.CalculationOrderByWithRelationInput = {};
  const sortField = params.sortBy ?? "calculationTimestamp";
  const sortOrder = params.sortOrder ?? "desc";
  (orderBy as Record<string, string>)[sortField] = sortOrder;

  const [data, total] = await Promise.all([
    prisma.calculation.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { inputEvidence: true, outputEvidence: true } },
      },
    }),
    prisma.calculation.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
