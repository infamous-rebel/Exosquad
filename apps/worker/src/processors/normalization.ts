import type { Job } from "bullmq";
import { createChildLogger } from "@exosquad/logger";

/**
 * Normalization job processor.
 * Transforms raw observations into the canonical EXOSQUAD data model.
 *
 * Phase 2 will implement:
 * - Schema mapping from various source formats
 * - Entity extraction and resolution
 * - Product identity matching (brand, SKU, GTIN, MPN)
 * - Confidence scoring
 * - Evidence chain creation
 */
export async function processNormalizationJob(job: Job): Promise<void> {
  const jobLogger = createChildLogger({
    jobId: job.id,
    jobName: job.name,
    queue: "normalization",
  });

  jobLogger.info({ data: job.data }, "Processing normalization job");

  const { observationId, sourceId, tenantId } = job.data as {
    observationId?: string;
    sourceId?: string;
    tenantId?: string;
  };

  if (!observationId || !sourceId || !tenantId) {
    throw new Error(
      "Missing required fields: observationId, sourceId, tenantId"
    );
  }

  try {
    // Phase 2: Implement normalization pipeline
    // 1. Fetch raw observation
    // 2. Apply source-specific parser
    // 3. Map to canonical schema
    // 4. Run entity resolution
    // 5. Create/update product records
    // 6. Create evidence records
    // 7. Update observation status

    jobLogger.info(
      { observationId, sourceId, tenantId },
      "Normalization job completed (stub — Phase 2 will implement actual normalization)"
    );
  } catch (err) {
    jobLogger.error(
      { err, observationId, sourceId, tenantId },
      "Normalization job failed"
    );
    throw err;
  }
}
