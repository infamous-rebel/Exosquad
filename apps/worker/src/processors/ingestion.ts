import type { Job } from "bullmq";
import { createChildLogger } from "@exosquad/logger";

/**
 * Ingestion job processor.
 * Fetches data from external sources and stores raw observations.
 *
 * Phase 2 will implement actual HTTP fetching, parsing, and storage.
 * This foundation establishes the job lifecycle: validate → fetch → store → enqueue next.
 */
export async function processIngestionJob(job: Job): Promise<void> {
  const jobLogger = createChildLogger({
    jobId: job.id,
    jobName: job.name,
    queue: "ingestion",
  });

  jobLogger.info({ data: job.data }, "Processing ingestion job");

  // ─── Validate job data ─────────────────────────────────────────────────
  const { sourceId, tenantId } = job.data as {
    sourceId?: string;
    tenantId?: string;
  };

  if (!sourceId || !tenantId) {
    throw new Error("Missing required fields: sourceId, tenantId");
  }

  // ─── Update job status in database ─────────────────────────────────────
  // Phase 2: Import prisma and update the Job record
  // await prisma.job.update({ where: { id: job.id }, data: { status: 'running', startedAt: new Date() } });

  try {
    // ─── Fetch data from source ──────────────────────────────────────────
    // Phase 2: Implement actual fetching via universal connector
    // const source = await prisma.source.findFirst({ where: { id: sourceId, tenantId } });
    // const connector = ConnectorFactory.create(source);
    // const rawData = await connector.fetch();

    // ─── Store raw observation ───────────────────────────────────────────
    // Phase 2: Persist observation with full provenance
    // await prisma.observation.create({ data: { ... } });

    // ─── Enqueue normalization ───────────────────────────────────────────
    // Phase 2: Add to normalization queue
    // await queueManager.addJob('normalization', 'normalize', { observationId, sourceId, tenantId });

    jobLogger.info({ sourceId, tenantId }, "Ingestion job completed (stub — Phase 2 will implement actual fetching)");
  } catch (err) {
    jobLogger.error({ err, sourceId, tenantId }, "Ingestion job failed");
    throw err;
  }
}
