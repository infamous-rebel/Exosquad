// =============================================================================
// Worker — Evidence Processor (Phase 6)
// =============================================================================
// Generates evidence records from normalized observations, derives claims from
// evidence patterns, and recomputes provenance freshness across tenants.
//
// Job types:
// - generate_evidence: Extract evidence fields from a normalized observation
// - generate_claims: Derive claims from evidence for a given entity
// - recompute_provenance: Refresh freshness for all tenant evidence
// =============================================================================

import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@exosquad/database";
import { createChildLogger } from "@exosquad/logger";

// ─── Field → Evidence Type Mapping ──────────────────────────────────────────

interface FieldMapping {
  fields: string[];
  evidenceType: string;
  entityType: string;
  valueType: string;
}

const FIELD_MAPPINGS: FieldMapping[] = [
  { fields: ["productName", "name"], evidenceType: "PRODUCT_IDENTITY", entityType: "product", valueType: "string" },
  { fields: ["brandName", "brand"], evidenceType: "BRAND_IDENTITY", entityType: "brand", valueType: "string" },
  { fields: ["price"], evidenceType: "PRICE", entityType: "product", valueType: "number" },
  { fields: ["currency"], evidenceType: "CURRENCY", entityType: "product", valueType: "string" },
  { fields: ["availability"], evidenceType: "AVAILABILITY", entityType: "product", valueType: "string" },
  { fields: ["sellerName", "seller"], evidenceType: "SELLER_IDENTITY", entityType: "seller", valueType: "string" },
  { fields: ["supplierName", "supplier"], evidenceType: "SUPPLIER_IDENTITY", entityType: "supplier", valueType: "string" },
  { fields: ["countryOfOrigin", "country"], evidenceType: "COUNTRY_OF_ORIGIN", entityType: "product", valueType: "string" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function computeFreshness(observedAt: Date): string {
  const ageHours = (Date.now() - observedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < 1) return "live";
  if (ageHours < 24) return "fresh";
  if (ageHours < 72) return "aging";
  return "stale";
}

// ─── generate_evidence ──────────────────────────────────────────────────────

async function handleGenerateEvidence(
  job: Job,
  log: ReturnType<typeof createChildLogger>,
): Promise<void> {
  const { observationId, tenantId } = job.data as {
    observationId?: string;
    tenantId?: string;
  };

  if (!observationId || !tenantId) {
    throw new Error("Missing required fields: observationId, tenantId");
  }

  const observation = await prisma.observation.findFirst({
    where: { id: observationId, tenantId },
    include: { source: true },
  });

  if (!observation) {
    log.warn({ observationId }, "Observation not found");
    return;
  }

  if (!observation.normalizedPayload) {
    log.warn({ observationId }, "Observation has no normalizedPayload");
    return;
  }

  const payload = observation.normalizedPayload as Record<string, unknown>;
  let created = 0;
  let skipped = 0;

  for (const mapping of FIELD_MAPPINGS) {
    for (const field of mapping.fields) {
      const value = payload[field];
      if (value == null || value === "") continue;

      const contentHash = sha256(value);
      const sourcePath = `$.${field}`;

      // Dedup via unique constraint
      const existing = await prisma.evidence.findFirst({
        where: {
          tenantId,
          sourceId: observation.sourceId,
          observationId,
          sourcePath,
          evidenceType: mapping.evidenceType,
          contentHash,
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const freshness = computeFreshness(observation.observedAt);

      await prisma.evidence.create({
        data: {
          tenantId,
          sourceId: observation.sourceId,
          observationId,
          evidenceType: mapping.evidenceType,
          title: `${mapping.evidenceType} from ${field}`,
          sourcePath,
          sourceField: field,
          extractedValue: value as Prisma.InputJsonValue,
          normalizedValue: value as Prisma.InputJsonValue,
          valueType: mapping.valueType,
          confidence: 1.0,
          contentHash,
          freshness,
          observedAt: observation.observedAt,
          retrievedAt: observation.retrievedAt,
          extractionMethod: "parser",
          parserVersion: observation.parserVersion,
          status: "active",
          observationStatus: "observed",
          method: "automated",
          entityType: mapping.entityType,
          entityId: observation.productId ?? observation.id,
          productId: observation.productId,
        },
      });

      created++;
      break; // first matching field wins per mapping
    }
  }

  log.info(
    { observationId, tenantId, created, skipped },
    "Evidence generation completed",
  );
}

// ─── generate_claims ────────────────────────────────────────────────────────

async function handleGenerateClaims(
  job: Job,
  log: ReturnType<typeof createChildLogger>,
): Promise<void> {
  const { entityType, entityId, tenantId } = job.data as {
    entityType?: string;
    entityId?: string;
    tenantId?: string;
  };

  if (!entityType || !entityId || !tenantId) {
    throw new Error("Missing required fields: entityType, entityId, tenantId");
  }

  const evidence = await prisma.evidence.findMany({
    where: { tenantId, entityType, entityId, status: "active" },
  });

  if (evidence.length === 0) {
    log.warn({ entityType, entityId }, "No active evidence found for entity");
    return;
  }

  const evidenceByType = new Map<string, (typeof evidence)[number]>();
  for (const e of evidence) {
    evidenceByType.set(e.evidenceType, e);
  }

  let claimsCreated = 0;

  // PRICE evidence → PRICE_IS claim
  const priceEv = evidenceByType.get("PRICE");
  if (priceEv) {
    const currencyEv = evidenceByType.get("CURRENCY");
    const claimValue = currencyEv
      ? { amount: priceEv.extractedValue, currency: currencyEv.extractedValue }
      : priceEv.extractedValue;

    await prisma.claim.create({
      data: {
        tenantId,
        subjectType: entityType,
        subjectId: entityId,
        predicate: "PRICE_IS",
        claimType: "attribute",
        value: claimValue as Prisma.InputJsonValue,
        confidence: priceEv.confidence,
        observationStatus: "observed",
        observedAt: priceEv.observedAt,
        evidence: { connect: { id: priceEv.id } },
      },
    });
    claimsCreated++;
  }

  // AVAILABILITY evidence → AVAILABLE claim
  const availEv = evidenceByType.get("AVAILABILITY");
  if (availEv) {
    await prisma.claim.create({
      data: {
        tenantId,
        subjectType: entityType,
        subjectId: entityId,
        predicate: "AVAILABLE",
        claimType: "attribute",
        value: availEv.extractedValue as Prisma.InputJsonValue,
        confidence: availEv.confidence,
        observationStatus: "observed",
        observedAt: availEv.observedAt,
        evidence: { connect: { id: availEv.id } },
      },
    });
    claimsCreated++;
  }

  // SELLER_IDENTITY + PRODUCT_IDENTITY → SELLS claim
  const sellerEv = evidenceByType.get("SELLER_IDENTITY");
  const productEv = evidenceByType.get("PRODUCT_IDENTITY");
  if (sellerEv && productEv) {
    await prisma.claim.create({
      data: {
        tenantId,
        subjectType: "seller",
        subjectId: sellerEv.entityId,
        predicate: "SELLS",
        objectType: "product",
        objectId: productEv.entityId,
        claimType: "relationship",
        confidence: Math.min(sellerEv.confidence, productEv.confidence),
        observationStatus: "observed",
        observedAt: sellerEv.observedAt,
        evidence: { connect: [{ id: sellerEv.id }, { id: productEv.id }] },
      },
    });
    claimsCreated++;
  }

  // SUPPLIER_IDENTITY + PRODUCT_IDENTITY → SUPPLIES claim
  const supplierEv = evidenceByType.get("SUPPLIER_IDENTITY");
  if (supplierEv && productEv) {
    await prisma.claim.create({
      data: {
        tenantId,
        subjectType: "supplier",
        subjectId: supplierEv.entityId,
        predicate: "SUPPLIES",
        objectType: "product",
        objectId: productEv.entityId,
        claimType: "relationship",
        confidence: Math.min(supplierEv.confidence, productEv.confidence),
        observationStatus: "observed",
        observedAt: supplierEv.observedAt,
        evidence: { connect: [{ id: supplierEv.id }, { id: productEv.id }] },
      },
    });
    claimsCreated++;
  }

  // BRAND_IDENTITY → OWNS_BRAND claim
  const brandEv = evidenceByType.get("BRAND_IDENTITY");
  if (brandEv && productEv) {
    await prisma.claim.create({
      data: {
        tenantId,
        subjectType: "product",
        subjectId: productEv.entityId,
        predicate: "OWNS_BRAND",
        objectType: "brand",
        objectId: brandEv.entityId,
        claimType: "identity",
        confidence: brandEv.confidence,
        observationStatus: "observed",
        observedAt: brandEv.observedAt,
        evidence: { connect: { id: brandEv.id } },
      },
    });
    claimsCreated++;
  }

  log.info(
    { entityType, entityId, tenantId, claimsCreated },
    "Claims generation completed",
  );
}

// ─── recompute_provenance ───────────────────────────────────────────────────

async function handleRecomputeProvenance(
  job: Job,
  log: ReturnType<typeof createChildLogger>,
): Promise<void> {
  const { tenantId } = job.data as { tenantId?: string };

  if (!tenantId) {
    throw new Error("Missing required field: tenantId");
  }

  const evidence = await prisma.evidence.findMany({
    where: { tenantId },
    select: { id: true, observedAt: true },
  });

  let updated = 0;

  for (const ev of evidence) {
    const freshness = computeFreshness(ev.observedAt);
    await prisma.evidence.update({
      where: { id: ev.id },
      data: { freshness },
    });
    updated++;
  }

  log.info(
    { tenantId, total: evidence.length, updated },
    "Provenance recomputation completed",
  );
}

// ─── Main Dispatch ──────────────────────────────────────────────────────────

/**
 * Process an evidence generation job.
 * Dispatches to the appropriate handler based on job.name.
 */
export async function processEvidenceJob(job: Job): Promise<void> {
  const log = createChildLogger({
    jobId: job.id,
    jobName: job.name,
    queue: "evidence_generation",
  });

  log.info({ data: job.data }, `Processing evidence job: ${job.name}`);

  const startTime = Date.now();

  try {
    // Update job record to running
    await prisma.job.upsert({
      where: { id: job.id ?? "" },
      create: {
        id: job.id ?? undefined,
        tenantId: (job.data as Record<string, unknown>).tenantId as string ?? "",
        queue: "evidence_generation",
        type: job.name,
        payload: job.data as Prisma.InputJsonValue,
        status: "running",
        attempts: job.attemptsMade,
        startedAt: new Date(),
      },
      update: {
        status: "running",
        attempts: job.attemptsMade,
        startedAt: new Date(),
      },
    });

    switch (job.name) {
      case "generate_evidence":
        await handleGenerateEvidence(job, log);
        break;
      case "generate_claims":
        await handleGenerateClaims(job, log);
        break;
      case "recompute_provenance":
        await handleRecomputeProvenance(job, log);
        break;
      default:
        throw new Error(`Unknown evidence job type: ${job.name}`);
    }

    const totalLatency = Date.now() - startTime;

    // Update job record to completed
    await prisma.job.upsert({
      where: { id: job.id ?? "" },
      create: {
        id: job.id ?? undefined,
        tenantId: (job.data as Record<string, unknown>).tenantId as string ?? "",
        queue: "evidence_generation",
        type: job.name,
        payload: job.data as Prisma.InputJsonValue,
        status: "completed",
        result: { latencyMs: totalLatency } as Prisma.InputJsonValue,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      },
      update: {
        status: "completed",
        result: { latencyMs: totalLatency } as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    log.info({ latencyMs: totalLatency }, "Evidence job completed");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const totalLatency = Date.now() - startTime;

    // Update job record to failed
    await prisma.job.upsert({
      where: { id: job.id ?? "" },
      create: {
        id: job.id ?? undefined,
        tenantId: (job.data as Record<string, unknown>).tenantId as string ?? "",
        queue: "evidence_generation",
        type: job.name,
        payload: job.data as Prisma.InputJsonValue,
        status: "failed",
        attempts: job.attemptsMade,
        error: errorMessage.substring(0, 2000),
        startedAt: new Date(startTime),
        completedAt: new Date(),
      },
      update: {
        status: "failed",
        error: errorMessage.substring(0, 2000),
        completedAt: new Date(),
      },
    });

    log.error(
      { latencyMs: totalLatency, error: errorMessage },
      "Evidence job failed",
    );

    throw err;
  }
}
