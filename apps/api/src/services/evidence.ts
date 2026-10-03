// =============================================================================
// Evidence Service — Phase 6
// =============================================================================
// Core business logic for evidence extraction, creation, querying, freshness,
// and deduplication. Converts observations into structured evidence records.
// =============================================================================

import { prisma } from "@exosquad/database";
import type { Evidence, Prisma } from "@exosquad/database";
import { createHash } from "node:crypto";
import { logger } from "@exosquad/logger";
import {
  EvidenceExtractionError,
  type PaginatedResult,
} from "@exosquad/common";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateEvidenceInput {
  tenantId: string;
  sourceId?: string;
  observationId?: string;
  rawResponseId?: string;
  evidenceType: string;
  title: string;
  description?: string;
  sourceUrl?: string;
  sourceRecordId?: string;
  sourceField?: string;
  sourcePath?: string;
  extractedValue?: unknown;
  normalizedValue?: unknown;
  valueType?: string;
  confidence?: number;
  confidenceBasis?: unknown;
  observedAt?: Date;
  retrievedAt?: Date;
  publishedAt?: Date;
  validFrom?: Date;
  validUntil?: Date;
  freshness?: string;
  contentHash?: string;
  extractionMethod?: string;
  parserVersion?: string;
  normalizationVersion?: string;
  fieldMappingVersion?: string;
  extractionTimestamp?: Date;
  status?: string;
  observationStatus?: string;
  entityType: string;
  entityId: string;
  productId?: string;
  identityDecisionId?: string;
  orgIdentityDecisionId?: string;
  commercialRelationshipId?: string;
  productSellerId?: string;
  productSupplierId?: string;
}

export interface EvidenceQueryParams {
  tenantId: string;
  sourceId?: string;
  observationId?: string;
  productId?: string;
  sellerId?: string;
  supplierId?: string;
  organizationId?: string;
  evidenceType?: string;
  status?: string;
  freshness?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  observedAfter?: Date;
  observedBefore?: Date;
  entityType?: string;
  entityId?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ─── Content Hashing ─────────────────────────────────────────────────────────

/**
 * Compute SHA-256 content hash for evidence deduplication.
 */
export function computeContentHash(value: unknown): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return createHash("sha256").update(serialized).digest("hex");
}

// ─── Evidence Extraction ─────────────────────────────────────────────────────

/**
 * Extract evidence records from a normalized observation.
 * Converts observation payload fields into individual typed evidence records.
 */
export async function extractEvidenceFromObservation(
  observationId: string,
  tenantId: string
): Promise<Evidence[]> {
  const observation = await prisma.observation.findFirst({
    where: { id: observationId, tenantId },
    include: { source: true },
  });

  if (!observation) {
    throw new EvidenceExtractionError("Observation not found", { observationId, tenantId });
  }

  if (!observation.normalizedPayload) {
    throw new EvidenceExtractionError("Observation has no normalized payload", {
      observationId,
      normalizationStatus: observation.normalizationStatus,
    });
  }

  const normalized = observation.normalizedPayload as Record<string, unknown>;
  const evidenceRecords: Evidence[] = [];

  // Extract product identity evidence
  if (normalized.productName || normalized.name) {
    const value = (normalized.productName ?? normalized.name) as string;
    const evidence = await createEvidence({
      tenantId,
      sourceId: observation.sourceId,
      observationId: observation.id,
      evidenceType: "PRODUCT_IDENTITY",
      title: "Product name",
      sourcePath: normalized.productName ? "$.productName" : "$.name",
      extractedValue: value,
      normalizedValue: value,
      valueType: "string",
      confidence: 0.9,
      confidenceBasis: ["direct_extraction"],
      observedAt: observation.observedAt,
      retrievedAt: observation.retrievedAt,
      extractionMethod: "automated",
      parserVersion: observation.parserVersion ?? undefined,
      entityType: "product",
      entityId: observation.productId ?? observation.id,
      productId: observation.productId ?? undefined,
      contentHash: computeContentHash(value),
    });
    evidenceRecords.push(evidence);
  }

  // Extract brand evidence
  if (normalized.brandName || normalized.brand) {
    const value = (normalized.brandName ?? normalized.brand) as string;
    const evidence = await createEvidence({
      tenantId,
      sourceId: observation.sourceId,
      observationId: observation.id,
      evidenceType: "BRAND_IDENTITY",
      title: "Brand name",
      sourcePath: normalized.brandName ? "$.brandName" : "$.brand",
      extractedValue: value,
      normalizedValue: value,
      valueType: "string",
      confidence: 0.85,
      confidenceBasis: ["direct_extraction"],
      observedAt: observation.observedAt,
      retrievedAt: observation.retrievedAt,
      extractionMethod: "automated",
      parserVersion: observation.parserVersion ?? undefined,
      entityType: "brand",
      entityId: observation.brandId ?? observation.id,
      contentHash: computeContentHash(value),
    });
    evidenceRecords.push(evidence);
  }

  // Extract price evidence
  if (normalized.price !== undefined && normalized.price !== null) {
    const value = normalized.price as number;
    const evidence = await createEvidence({
      tenantId,
      sourceId: observation.sourceId,
      observationId: observation.id,
      evidenceType: "PRICE",
      title: "Product price",
      sourcePath: "$.price",
      extractedValue: value,
      normalizedValue: value,
      valueType: "number",
      confidence: 0.95,
      confidenceBasis: ["direct_extraction"],
      observedAt: observation.observedAt,
      retrievedAt: observation.retrievedAt,
      extractionMethod: "automated",
      parserVersion: observation.parserVersion ?? undefined,
      entityType: "product",
      entityId: observation.productId ?? observation.id,
      productId: observation.productId ?? undefined,
      contentHash: computeContentHash(value),
    });
    evidenceRecords.push(evidence);
  }

  // Extract currency evidence
  if (normalized.currency) {
    const value = normalized.currency as string;
    const evidence = await createEvidence({
      tenantId,
      sourceId: observation.sourceId,
      observationId: observation.id,
      evidenceType: "CURRENCY",
      title: "Price currency",
      sourcePath: "$.currency",
      extractedValue: value,
      normalizedValue: value.toUpperCase(),
      valueType: "string",
      confidence: 0.9,
      confidenceBasis: ["direct_extraction"],
      observedAt: observation.observedAt,
      retrievedAt: observation.retrievedAt,
      extractionMethod: "automated",
      parserVersion: observation.parserVersion ?? undefined,
      entityType: "product",
      entityId: observation.productId ?? observation.id,
      productId: observation.productId ?? undefined,
      contentHash: computeContentHash(value),
    });
    evidenceRecords.push(evidence);
  }

  // Extract availability evidence
  if (normalized.availability !== undefined) {
    const value = normalized.availability as string;
    const evidence = await createEvidence({
      tenantId,
      sourceId: observation.sourceId,
      observationId: observation.id,
      evidenceType: "AVAILABILITY",
      title: "Product availability",
      sourcePath: "$.availability",
      extractedValue: value,
      normalizedValue: value.toLowerCase(),
      valueType: "string",
      confidence: 0.85,
      confidenceBasis: ["direct_extraction"],
      observedAt: observation.observedAt,
      retrievedAt: observation.retrievedAt,
      extractionMethod: "automated",
      parserVersion: observation.parserVersion ?? undefined,
      entityType: "product",
      entityId: observation.productId ?? observation.id,
      productId: observation.productId ?? undefined,
      contentHash: computeContentHash(value),
    });
    evidenceRecords.push(evidence);
  }

  // Extract seller evidence
  if (normalized.sellerName || normalized.seller) {
    const value = (normalized.sellerName ?? normalized.seller) as string;
    const evidence = await createEvidence({
      tenantId,
      sourceId: observation.sourceId,
      observationId: observation.id,
      evidenceType: "SELLER_IDENTITY",
      title: "Seller name",
      sourcePath: normalized.sellerName ? "$.sellerName" : "$.seller",
      extractedValue: value,
      normalizedValue: value,
      valueType: "string",
      confidence: 0.8,
      confidenceBasis: ["direct_extraction"],
      observedAt: observation.observedAt,
      retrievedAt: observation.retrievedAt,
      extractionMethod: "automated",
      parserVersion: observation.parserVersion ?? undefined,
      entityType: "seller",
      entityId: observation.id, // will be linked to actual seller after resolution
      contentHash: computeContentHash(value),
    });
    evidenceRecords.push(evidence);
  }

  // Extract supplier evidence
  if (normalized.supplierName || normalized.supplier) {
    const value = (normalized.supplierName ?? normalized.supplier) as string;
    const evidence = await createEvidence({
      tenantId,
      sourceId: observation.sourceId,
      observationId: observation.id,
      evidenceType: "SUPPLIER_IDENTITY",
      title: "Supplier name",
      sourcePath: normalized.supplierName ? "$.supplierName" : "$.supplier",
      extractedValue: value,
      normalizedValue: value,
      valueType: "string",
      confidence: 0.8,
      confidenceBasis: ["direct_extraction"],
      observedAt: observation.observedAt,
      retrievedAt: observation.retrievedAt,
      extractionMethod: "automated",
      parserVersion: observation.parserVersion ?? undefined,
      entityType: "supplier",
      entityId: observation.id,
      contentHash: computeContentHash(value),
    });
    evidenceRecords.push(evidence);
  }

  // Extract country of origin evidence
  if (normalized.countryOfOrigin || normalized.country) {
    const value = (normalized.countryOfOrigin ?? normalized.country) as string;
    const evidence = await createEvidence({
      tenantId,
      sourceId: observation.sourceId,
      observationId: observation.id,
      evidenceType: "COUNTRY_OF_ORIGIN",
      title: "Country of origin",
      sourcePath: normalized.countryOfOrigin ? "$.countryOfOrigin" : "$.country",
      extractedValue: value,
      normalizedValue: value.toUpperCase(),
      valueType: "string",
      confidence: 0.7,
      confidenceBasis: ["direct_extraction"],
      observedAt: observation.observedAt,
      retrievedAt: observation.retrievedAt,
      extractionMethod: "automated",
      parserVersion: observation.parserVersion ?? undefined,
      entityType: "product",
      entityId: observation.productId ?? observation.id,
      productId: observation.productId ?? undefined,
      contentHash: computeContentHash(value),
    });
    evidenceRecords.push(evidence);
  }

  logger.info(
    { observationId, tenantId, evidenceCount: evidenceRecords.length },
    "Evidence extracted from observation"
  );

  return evidenceRecords;
}

// ─── Create Evidence ─────────────────────────────────────────────────────────

/**
 * Create a single evidence record with deduplication.
 * Uses content hash + source + observation + path as dedup key.
 */
export async function createEvidence(input: CreateEvidenceInput): Promise<Evidence> {
  const contentHash = input.contentHash ?? computeContentHash(input.extractedValue ?? input.normalizedValue);

  // Compute freshness based on observedAt
  const freshness = input.freshness ?? calculateFreshness(input.observedAt ?? new Date(), input.evidenceType);

  // Check for duplicate evidence (same source + observation + path + type + hash)
  if (input.sourceId && input.observationId && input.sourcePath) {
    const existing = await prisma.evidence.findFirst({
      where: {
        tenantId: input.tenantId,
        sourceId: input.sourceId,
        observationId: input.observationId,
        sourcePath: input.sourcePath,
        evidenceType: input.evidenceType,
        contentHash,
      },
    });

    if (existing) {
      logger.debug(
        { evidenceId: existing.id, observationId: input.observationId },
        "Duplicate evidence skipped"
      );
      return existing;
    }
  }

  const evidence = await prisma.evidence.create({
    data: {
      tenantId: input.tenantId,
      sourceId: input.sourceId,
      observationId: input.observationId,
      rawResponseId: input.rawResponseId,
      evidenceType: input.evidenceType,
      title: input.title,
      description: input.description,
      sourceUrl: input.sourceUrl,
      sourceRecordId: input.sourceRecordId,
      sourceField: input.sourceField,
      sourcePath: input.sourcePath,
      extractedValue: input.extractedValue ?? undefined,
      normalizedValue: input.normalizedValue ?? undefined,
      valueType: input.valueType ?? "string",
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.5)),
      confidenceBasis: input.confidenceBasis ?? undefined,
      observedAt: input.observedAt ?? new Date(),
      retrievedAt: input.retrievedAt ?? new Date(),
      publishedAt: input.publishedAt,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      freshness,
      contentHash,
      extractionMethod: input.extractionMethod ?? "automated",
      parserVersion: input.parserVersion,
      normalizationVersion: input.normalizationVersion,
      fieldMappingVersion: input.fieldMappingVersion,
      extractionTimestamp: input.extractionTimestamp ?? new Date(),
      status: input.status ?? "active",
      observationStatus: input.observationStatus ?? "observed",
      method: input.extractionMethod ?? "automated",
      methodVersion: input.parserVersion,
      entityType: input.entityType,
      entityId: input.entityId,
      productId: input.productId,
      identityDecisionId: input.identityDecisionId,
      orgIdentityDecisionId: input.orgIdentityDecisionId,
      commercialRelationshipId: input.commercialRelationshipId,
      productSellerId: input.productSellerId,
      productSupplierId: input.productSupplierId,
    },
  });

  logger.info(
    { evidenceId: evidence.id, evidenceType: evidence.evidenceType, tenantId: input.tenantId },
    "Evidence created"
  );

  return evidence;
}

// ─── Batch Evidence Creation ─────────────────────────────────────────────────

/**
 * Create multiple evidence records in a transaction.
 */
export async function createEvidenceBatch(
  inputs: CreateEvidenceInput[]
): Promise<Evidence[]> {
  if (inputs.length === 0) return [];

  const results = await prisma.$transaction(
    inputs.map((input) =>
      prisma.evidence.create({
        data: {
          tenantId: input.tenantId,
          sourceId: input.sourceId,
          observationId: input.observationId,
          rawResponseId: input.rawResponseId,
          evidenceType: input.evidenceType,
          title: input.title,
          description: input.description,
          sourceUrl: input.sourceUrl,
          sourceRecordId: input.sourceRecordId,
          sourceField: input.sourceField,
          sourcePath: input.sourcePath,
          extractedValue: input.extractedValue ?? undefined,
          normalizedValue: input.normalizedValue ?? undefined,
          valueType: input.valueType ?? "string",
          confidence: Math.max(0, Math.min(1, input.confidence ?? 0.5)),
          confidenceBasis: input.confidenceBasis ?? undefined,
          observedAt: input.observedAt ?? new Date(),
          retrievedAt: input.retrievedAt ?? new Date(),
          publishedAt: input.publishedAt,
          validFrom: input.validFrom,
          validUntil: input.validUntil,
          freshness: input.freshness ?? calculateFreshness(input.observedAt ?? new Date(), input.evidenceType),
          contentHash: input.contentHash ?? computeContentHash(input.extractedValue ?? input.normalizedValue),
          extractionMethod: input.extractionMethod ?? "automated",
          parserVersion: input.parserVersion,
          normalizationVersion: input.normalizationVersion,
          fieldMappingVersion: input.fieldMappingVersion,
          extractionTimestamp: input.extractionTimestamp ?? new Date(),
          status: input.status ?? "active",
          observationStatus: input.observationStatus ?? "observed",
          method: input.extractionMethod ?? "automated",
          methodVersion: input.parserVersion,
          entityType: input.entityType,
          entityId: input.entityId,
          productId: input.productId,
          identityDecisionId: input.identityDecisionId,
          orgIdentityDecisionId: input.orgIdentityDecisionId,
          commercialRelationshipId: input.commercialRelationshipId,
          productSellerId: input.productSellerId,
          productSupplierId: input.productSupplierId,
        },
      })
    )
  );

  logger.info(
    { count: results.length, tenantId: inputs[0]?.tenantId },
    "Evidence batch created"
  );

  return results;
}

// ─── Query Evidence ──────────────────────────────────────────────────────────

/**
 * Query evidence with filtering, pagination, and sorting.
 */
export async function queryEvidence(
  params: EvidenceQueryParams
): Promise<PaginatedResult<Evidence>> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);

  const where: Prisma.EvidenceWhereInput = {
    tenantId: params.tenantId,
  };

  if (params.sourceId) where.sourceId = params.sourceId;
  if (params.observationId) where.observationId = params.observationId;
  if (params.productId) where.productId = params.productId;
  if (params.evidenceType) where.evidenceType = params.evidenceType;
  if (params.status) where.status = params.status;
  if (params.freshness) where.freshness = params.freshness;
  if (params.entityType) where.entityType = params.entityType;
  if (params.entityId) where.entityId = params.entityId;

  if (params.confidenceMin !== undefined || params.confidenceMax !== undefined) {
    where.confidence = {};
    if (params.confidenceMin !== undefined) where.confidence.gte = params.confidenceMin;
    if (params.confidenceMax !== undefined) where.confidence.lte = params.confidenceMax;
  }

  if (params.observedAfter || params.observedBefore) {
    where.observedAt = {};
    if (params.observedAfter) where.observedAt.gte = params.observedAfter;
    if (params.observedBefore) where.observedAt.lte = params.observedBefore;
  }

  if (params.search) {
    where.title = { contains: params.search, mode: "insensitive" };
  }

  const orderBy: Prisma.EvidenceOrderByWithRelationInput = {};
  const sortField = params.sortBy ?? "createdAt";
  const sortOrder = params.sortOrder ?? "desc";
  (orderBy as Record<string, string>)[sortField] = sortOrder;

  const [data, total] = await Promise.all([
    prisma.evidence.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        source: { select: { id: true, name: true, type: true } },
        observation: { select: { id: true, observedAt: true, retrievedAt: true } },
      },
    }),
    prisma.evidence.count({ where }),
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

// ─── Get Evidence by ID ──────────────────────────────────────────────────────

export async function getEvidenceById(
  tenantId: string,
  evidenceId: string
): Promise<Evidence | null> {
  return prisma.evidence.findFirst({
    where: { id: evidenceId, tenantId },
    include: {
      source: { select: { id: true, name: true, type: true, healthStatus: true } },
      observation: true,
      rawResponse: { select: { id: true, requestUrl: true, httpStatus: true, retrievedAt: true } },
    },
  });
}

// ─── Freshness Calculation ───────────────────────────────────────────────────

/**
 * Calculate freshness state based on evidence type and age.
 * Different evidence types have different freshness thresholds:
 * - Stock/availability: minutes
 * - Price: hours
 * - Identity: days
 * - Organization: weeks/months
 */
export function calculateFreshness(observedAt: Date, evidenceType: string): string {
  const now = new Date();
  const ageMs = now.getTime() - observedAt.getTime();
  const ageMinutes = ageMs / (1000 * 60);
  const ageHours = ageMinutes / 60;
  const ageDays = ageHours / 24;

  // Type-specific thresholds
  const thresholds = getFreshnessThresholds(evidenceType);

  if (ageMinutes <= thresholds.liveMinutes) return "live";
  if (ageHours <= thresholds.freshHours) return "fresh";
  if (ageDays <= thresholds.agingDays) return "aging";
  return "stale";
}

interface FreshnessThresholds {
  liveMinutes: number;
  freshHours: number;
  agingDays: number;
}

function getFreshnessThresholds(evidenceType: string): FreshnessThresholds {
  switch (evidenceType) {
    case "STOCK":
    case "AVAILABILITY":
      return { liveMinutes: 15, freshHours: 1, agingDays: 1 };

    case "PRICE":
    case "SUPPLIER_PRICE":
    case "SUPPLIER_OFFER":
      return { liveMinutes: 60, freshHours: 24, agingDays: 7 };

    case "SELLER_LISTING":
    case "MARKET_OBSERVATION":
      return { liveMinutes: 120, freshHours: 48, agingDays: 14 };

    case "DEMAND_SIGNAL":
    case "SOCIAL_SIGNAL":
    case "SEARCH_SIGNAL":
    case "REVIEW_SIGNAL":
      return { liveMinutes: 360, freshHours: 72, agingDays: 30 };

    case "ORGANIZATION_IDENTITY":
    case "ORGANIZATION_DOMAIN":
    case "ORGANIZATION_EMAIL":
    case "ORGANIZATION_PHONE":
    case "ORGANIZATION_ADDRESS":
    case "ORGANIZATION_IDENTIFIER":
      return { liveMinutes: 1440, freshHours: 720, agingDays: 180 };

    case "PRODUCT_IDENTITY":
    case "BRAND_IDENTITY":
    case "AUTHENTICITY":
    case "COUNTRY_OF_ORIGIN":
      return { liveMinutes: 1440, freshHours: 336, agingDays: 90 };

    default:
      return { liveMinutes: 120, freshHours: 48, agingDays: 14 };
  }
}

// ─── Bulk Freshness Update ───────────────────────────────────────────────────

/**
 * Recompute freshness for all evidence of a given tenant.
 * Updates stale evidence in batches.
 */
export async function recomputeFreshness(tenantId: string): Promise<{
  updated: number;
  scanned: number;
}> {
  const batchSize = 500;
  let updated = 0;
  let scanned = 0;
  let skip = 0;

  while (true) {
    const batch = await prisma.evidence.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, observedAt: true, evidenceType: true, freshness: true },
      orderBy: { createdAt: "asc" },
      skip,
      take: batchSize,
    });

    if (batch.length === 0) break;
    scanned += batch.length;

    const updates = batch
      .map((e) => {
        const newFreshness = calculateFreshness(e.observedAt, e.evidenceType);
        if (newFreshness !== e.freshness) {
          return prisma.evidence.update({
            where: { id: e.id },
            data: { freshness: newFreshness },
          });
        }
        return null;
      })
      .filter(Boolean) as Prisma.PrismaPromise<Evidence>[];

    if (updates.length > 0) {
      await prisma.$transaction(updates);
      updated += updates.length;
    }

    skip += batchSize;
  }

  logger.info({ tenantId, scanned, updated }, "Freshness recomputed");
  return { updated, scanned };
}

// ─── Evidence Count by Entity ────────────────────────────────────────────────

export async function getEvidenceCountForEntity(
  tenantId: string,
  entityType: string,
  entityId: string
): Promise<number> {
  return prisma.evidence.count({
    where: { tenantId, entityType, entityId },
  });
}
