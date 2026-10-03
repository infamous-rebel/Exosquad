// =============================================================================
// Evidence Conflicts Service — Phase 6
// =============================================================================
// First-class conflict detection, tracking, and resolution.
// Detects contradictory evidence and manages the resolution lifecycle.
// =============================================================================

import { prisma } from "@exosquad/database";
import type { EvidenceConflict, Prisma } from "@exosquad/database";
import { logger } from "@exosquad/logger";
import type { PaginatedResult } from "@exosquad/common";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConflictQueryParams {
  tenantId: string;
  entityType?: string;
  entityId?: string;
  conflictType?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ResolveConflictInput {
  tenantId: string;
  conflictId: string;
  resolvedBy: string;
  resolution: string;
  resolverMethod?: string;
  newStatus?: string;
}

// ─── Conflict Detection ──────────────────────────────────────────────────────

/**
 * Detect conflicts for a given entity by finding contradictory evidence.
 * Looks for evidence of the same type with different values for the same entity.
 */
export async function detectConflicts(
  tenantId: string,
  entityType: string,
  entityId: string
): Promise<EvidenceConflict[]> {
  // Get all active evidence for this entity, grouped by type
  const evidence = await prisma.evidence.findMany({
    where: { tenantId, entityType, entityId, status: "active" },
    orderBy: { evidenceType: "asc" },
  });

  // Group by evidenceType + sourcePath
  const groups = new Map<string, typeof evidence>();
  for (const ev of evidence) {
    const key = `${ev.evidenceType}:${ev.sourcePath ?? "unknown"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }

  const conflicts: EvidenceConflict[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    // Find pairs with different normalized values
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;

        const valA = JSON.stringify(a.normalizedValue ?? a.extractedValue);
        const valB = JSON.stringify(b.normalizedValue ?? b.extractedValue);

        if (valA !== valB) {
          // Check if conflict already exists
          const existing = await prisma.evidenceConflict.findFirst({
            where: {
              tenantId,
              supportingEvidenceId: a.id,
              contradictingEvidenceId: b.id,
            },
          });

          if (!existing) {
            const reverse = await prisma.evidenceConflict.findFirst({
              where: {
                tenantId,
                supportingEvidenceId: b.id,
                contradictingEvidenceId: a.id,
              },
            });

            if (!reverse) {
              const [evidenceType = "unknown"] = key.split(":");
              const conflict = await prisma.evidenceConflict.create({
                data: {
                  tenantId,
                  entityType,
                  entityId,
                  conflictType: determineConflictType(evidenceType!),
                  description: `Conflicting ${evidenceType} values: "${valA}" vs "${valB}"`,
                  supportingEvidenceId: a.id,
                  contradictingEvidenceId: b.id,
                  status: "open",
                },
              });
              conflicts.push(conflict);

              // Mark evidence as conflicted
              await prisma.evidence.updateMany({
                where: { id: { in: [a.id, b.id] } },
                data: { status: "conflicted" },
              });

              logger.info(
                { conflictId: conflict.id, entityType, entityId, evidenceType },
                "Evidence conflict detected"
              );
            }
          }
        }
      }
    }
  }

  return conflicts;
}

function determineConflictType(evidenceType: string): string {
  if (evidenceType.includes("IDENTITY")) return "identity_conflict";
  if (evidenceType.includes("PRICE") || evidenceType.includes("SUPPLIER_PRICE")) return "value_conflict";
  if (evidenceType.includes("ORGANIZATION")) return "attribute_conflict";
  if (evidenceType.includes("RELATIONSHIP")) return "relationship_conflict";
  return "value_conflict";
}

// ─── Query Conflicts ─────────────────────────────────────────────────────────

export async function queryConflicts(
  params: ConflictQueryParams
): Promise<PaginatedResult<EvidenceConflict>> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);

  const where: Prisma.EvidenceConflictWhereInput = {
    tenantId: params.tenantId,
  };

  if (params.entityType) where.entityType = params.entityType;
  if (params.entityId) where.entityId = params.entityId;
  if (params.conflictType) where.conflictType = params.conflictType;
  if (params.status) where.status = params.status;

  const orderBy: Prisma.EvidenceConflictOrderByWithRelationInput = {};
  const sortField = params.sortBy ?? "createdAt";
  const sortOrder = params.sortOrder ?? "desc";
  (orderBy as Record<string, string>)[sortField] = sortOrder;

  const [data, total] = await Promise.all([
    prisma.evidenceConflict.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        supportingEvidence: {
          select: { id: true, title: true, evidenceType: true, confidence: true, observedAt: true, sourceUrl: true },
        },
        contradictingEvidence: {
          select: { id: true, title: true, evidenceType: true, confidence: true, observedAt: true, sourceUrl: true },
        },
      },
    }),
    prisma.evidenceConflict.count({ where }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get Conflict by ID ──────────────────────────────────────────────────────

export async function getConflictById(
  tenantId: string,
  conflictId: string
): Promise<EvidenceConflict | null> {
  return prisma.evidenceConflict.findFirst({
    where: { id: conflictId, tenantId },
    include: {
      supportingEvidence: {
        include: {
          source: { select: { id: true, name: true, type: true } },
          observation: { select: { id: true, observedAt: true } },
        },
      },
      contradictingEvidence: {
        include: {
          source: { select: { id: true, name: true, type: true } },
          observation: { select: { id: true, observedAt: true } },
        },
      },
    },
  });
}

// ─── Resolve Conflict ────────────────────────────────────────────────────────

export async function resolveConflict(
  input: ResolveConflictInput
): Promise<EvidenceConflict> {
  const conflict = await prisma.evidenceConflict.findFirst({
    where: { id: input.conflictId, tenantId: input.tenantId },
  });

  if (!conflict) {
    throw new Error(`Conflict not found: ${input.conflictId}`);
  }

  const resolved = await prisma.evidenceConflict.update({
    where: { id: input.conflictId },
    data: {
      status: input.newStatus ?? "resolved",
      resolvedAt: new Date(),
      resolvedBy: input.resolvedBy,
      resolution: input.resolution,
      resolverMethod: input.resolverMethod ?? "manual",
    },
  });

  logger.info(
    { conflictId: input.conflictId, resolvedBy: input.resolvedBy, tenantId: input.tenantId },
    "Evidence conflict resolved"
  );

  return resolved;
}
