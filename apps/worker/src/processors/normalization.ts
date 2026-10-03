// =============================================================================
// Worker — Normalization Processor (Phase 3)
// =============================================================================
// Real normalization pipeline that transforms raw observations into the
// canonical EXOSQUAD data model using @exosquad/normalization.
//
// Lifecycle:
// 1. Validate job payload
// 2. Run normalization pipeline for the source
// 3. Update job record with results
// 4. Handle errors with record-level isolation
// =============================================================================

import type { Job } from "bullmq";
import { prisma, type Prisma } from "@exosquad/database";
import { createChildLogger } from "@exosquad/logger";
import { normalizeBatch } from "../pipeline/normalize.js";

/**
 * Process a normalization job.
 * Runs the full normalization pipeline for all pending observations from a source.
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

  if (!sourceId || !tenantId) {
    throw new Error("Missing required fields: sourceId, tenantId");
  }

  const startTime = Date.now();

  try {
    // Update job record to running
    await prisma.job.upsert({
      where: { id: job.id ?? "" },
      create: {
        id: job.id ?? undefined,
        tenantId,
        queue: "normalization",
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

    // If a specific observationId is provided, normalize just that one
    // Otherwise, normalize all pending observations for the source
    if (observationId) {
      // Single observation normalization
      const observation = await prisma.observation.findFirst({
        where: { id: observationId, sourceId, tenantId, normalizationStatus: "pending" },
      });

      if (!observation) {
        jobLogger.warn({ observationId }, "Observation not found or already processed");
        await updateJobCompleted(job.id, tenantId, {
          normalized: 0,
          failed: 0,
          skipped: 1,
          message: "Observation not found or already processed",
        });
        return;
      }
    }

    // Run the normalization pipeline
    const stats = await normalizeBatch(sourceId, tenantId);

    const totalLatency = Date.now() - startTime;

    // Update job record to completed
    await updateJobCompleted(job.id, tenantId, {
      ...stats,
      latencyMs: totalLatency,
    });

    jobLogger.info(
      {
        sourceId,
        tenantId,
        total: stats.total,
        normalized: stats.normalized,
        failed: stats.failed,
        partial: stats.partial,
        skipped: stats.skipped,
        latencyMs: totalLatency,
      },
      "Normalization job completed"
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const totalLatency = Date.now() - startTime;

    // Update job record to failed
    await prisma.job.upsert({
      where: { id: job.id ?? "" },
      create: {
        id: job.id ?? undefined,
        tenantId,
        queue: "normalization",
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

    jobLogger.error(
      {
        sourceId,
        tenantId,
        latencyMs: totalLatency,
        error: errorMessage,
      },
      "Normalization job failed"
    );

    throw err;
  }
}

/**
 * Update the job record to completed status.
 */
async function updateJobCompleted(
  jobId: string | undefined,
  tenantId: string,
  result: Record<string, unknown>
): Promise<void> {
  await prisma.job.upsert({
    where: { id: jobId ?? "" },
    create: {
      id: jobId ?? undefined,
      tenantId,
      queue: "normalization",
      type: "normalization",
      payload: {} as Prisma.InputJsonValue,
      status: "completed",
      result: result as Prisma.InputJsonValue,
      startedAt: new Date(),
      completedAt: new Date(),
    },
    update: {
      status: "completed",
      result: result as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}
