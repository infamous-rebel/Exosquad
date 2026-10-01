// =============================================================================
// Worker — Ingestion Processor (Phase 2)
// =============================================================================
// Real HTTP ingestion via the universal connector engine.
// Lifecycle: validate → load source → fetch → persist raw → observe → checkpoint
// =============================================================================

import type { Job } from "bullmq";
import { prisma, type Prisma } from "@exosquad/database";
import { createChildLogger } from "@exosquad/logger";
import {
  HttpConnector,
  type SourceConfig,
  type CheckpointState,
  parseAuthConfig,
  parsePaginationConfig,
  parseRetryConfig,
  parseFieldMapping,
  computeContentHash,
  ConnectorError,
} from "@exosquad/connector";

// Shared connector instance (reused across jobs for circuit breaker / rate limiter state)
const connector = new HttpConnector();

/**
 * Process an ingestion job:
 * 1. Validate job data
 * 2. Load source from database
 * 3. Build connector config from source configuration
 * 4. Load checkpoint for resumable ingestion
 * 5. Execute HTTP fetch (with full resilience)
 * 6. Persist raw responses
 * 7. Create observations for each record
 * 8. Update source health metrics
 * 9. Save checkpoint
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

  // ─── Load source ───────────────────────────────────────────────────────
  const source = await prisma.source.findFirst({
    where: { id: sourceId, tenantId },
  });

  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  if (source.status === "disabled") {
    jobLogger.warn({ sourceId }, "Source is disabled — skipping");
    return;
  }

  // ─── Build connector config from source config ─────────────────────────
  const sourceConfigRaw = source.config as Record<string, unknown>;
  const connectorConfig = buildSourceConfig(sourceConfigRaw);

  // ─── Load checkpoint ───────────────────────────────────────────────────
  const existingCheckpoint = await prisma.ingestionCheckpoint.findUnique({
    where: { sourceId },
  });

  const checkpoint: CheckpointState | undefined = existingCheckpoint
    ? {
        lastCursor: existingCheckpoint.lastCursor ?? undefined,
        lastPage: existingCheckpoint.lastPage ?? undefined,
        lastOffset: existingCheckpoint.lastOffset ?? undefined,
        lastSyncTimestamp: existingCheckpoint.lastSyncTimestamp ?? undefined,
        totalRecordsProcessed: existingCheckpoint.totalRecordsProcessed,
      }
    : undefined;

  // ─── Update source: running ────────────────────────────────────────────
  await prisma.source.update({
    where: { id: sourceId },
    data: {
      lastRunAt: new Date(),
      status: "active",
    },
  });

  // ─── Update job record ─────────────────────────────────────────────────
  await prisma.job.upsert({
    where: { id: job.id ?? "" },
    create: {
      id: job.id ?? undefined,
      tenantId,
      queue: "ingestion",
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

  const startTime = Date.now();

  try {
    // ─── Execute HTTP fetch ──────────────────────────────────────────────
    const result = await connector.fetchAll(
      connectorConfig,
      sourceId,
      checkpoint,
      job.opts.parent?.id ? undefined : undefined // AbortSignal could be wired here
    );

    const totalLatency = Date.now() - startTime;

    // ─── Persist raw responses ───────────────────────────────────────────
    for (const fetchResult of result.results) {
      await prisma.rawResponse.create({
        data: {
          sourceId,
          tenantId,
          requestUrl: fetchResult.requestUrl,
          requestMethod: fetchResult.requestMethod,
          requestHeaders: fetchResult.requestHeaders as Prisma.InputJsonValue,
          httpStatus: fetchResult.status,
          responseHeaders: fetchResult.headers as Prisma.InputJsonValue,
          payloadInline: fetchResult.body as Prisma.InputJsonValue,
          contentHash: fetchResult.contentHash,
          latencyMs: fetchResult.latencyMs,
          recordCount: fetchResult.recordCount,
          jobId: job.id ?? undefined,
          retrievedAt: fetchResult.retrievedAt,
        },
      });
    }

    // ─── Create observations for each record ─────────────────────────────
    let observationCount = 0;
    for (const fetchResult of result.results) {
      const records = Array.isArray(fetchResult.body)
        ? fetchResult.body
        : extractRecords(fetchResult.body);

      for (const record of records) {
        const recordHash = computeContentHash(JSON.stringify(record));

        // Idempotency: skip if identical content already exists for this source
        const existing = await prisma.observation.findFirst({
          where: {
            sourceId,
            contentHash: recordHash,
          },
          select: { id: true },
        });

        if (existing) continue;

        await prisma.observation.create({
          data: {
            sourceId,
            tenantId,
            rawPayload: record as Prisma.InputJsonValue,
            contentHash: recordHash,
            retrievedAt: fetchResult.retrievedAt,
            observedAt: new Date(),
            parserVersion: "exosquad-connector/0.2.0",
            normalizationStatus: "pending",
          },
        });
        observationCount++;
      }
    }

    // ─── Save checkpoint ─────────────────────────────────────────────────
    await prisma.ingestionCheckpoint.upsert({
      where: { sourceId },
      create: {
        sourceId,
        tenantId,
        lastCursor: result.checkpoint.lastCursor,
        lastPage: result.checkpoint.lastPage,
        lastOffset: result.checkpoint.lastOffset,
        lastSyncTimestamp: result.checkpoint.lastSyncTimestamp,
        totalRecordsProcessed: result.checkpoint.totalRecordsProcessed,
      },
      update: {
        lastCursor: result.checkpoint.lastCursor,
        lastPage: result.checkpoint.lastPage,
        lastOffset: result.checkpoint.lastOffset,
        lastSyncTimestamp: result.checkpoint.lastSyncTimestamp,
        totalRecordsProcessed: result.checkpoint.totalRecordsProcessed,
      },
    });

    // ─── Update source health: success ───────────────────────────────────
    const newTotalFetched = source.totalFetched + result.totalRecords;
    const avgLatency = source.avgLatencyMs
      ? (source.avgLatencyMs * 0.7) + (totalLatency * 0.3)
      : totalLatency;

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        lastSuccessAt: new Date(),
        lastFetchedAt: new Date(),
        lastHealthyAt: new Date(),
        healthStatus: "healthy",
        consecutiveErrors: 0,
        totalFetched: newTotalFetched,
        avgLatencyMs: avgLatency,
        lastError: null,
        status: "active",
      },
    });

    // ─── Update job record: completed ────────────────────────────────────
    await prisma.job.update({
      where: { id: job.id ?? "" },
      data: {
        status: "completed",
        completedAt: new Date(),
        result: {
          totalRecords: result.totalRecords,
          newObservations: observationCount,
          pages: result.results.length,
          latencyMs: totalLatency,
        } as Prisma.InputJsonValue,
      },
    });

    jobLogger.info(
      {
        sourceId,
        tenantId,
        totalRecords: result.totalRecords,
        newObservations: observationCount,
        pages: result.results.length,
        latencyMs: totalLatency,
      },
      "Ingestion job completed successfully"
    );
  } catch (err) {
    // ─── Update source health: failure ───────────────────────────────────
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";
    const newConsecutiveErrors = source.consecutiveErrors + 1;

    // Determine health status based on consecutive errors
    let healthStatus: string;
    if (newConsecutiveErrors >= 5) {
      healthStatus = "unhealthy";
    } else if (newConsecutiveErrors >= 2) {
      healthStatus = "degraded";
    } else {
      healthStatus = source.healthStatus;
    }

    // Determine source status
    let sourceStatus: string;
    if (err instanceof ConnectorError && !err.retryable) {
      sourceStatus = "error"; // Auth failures, 404s, etc.
    } else if (newConsecutiveErrors >= 10) {
      sourceStatus = "error";
    } else {
      sourceStatus = source.status; // Preserve existing status
    }

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        lastError: errorMessage.substring(0, 1000),
        consecutiveErrors: newConsecutiveErrors,
        totalFailed: source.totalFailed + 1,
        healthStatus,
        status: sourceStatus,
      },
    });

    // ─── Update job record: failed ───────────────────────────────────────
    await prisma.job.upsert({
      where: { id: job.id ?? "" },
      create: {
        id: job.id ?? undefined,
        tenantId,
        queue: "ingestion",
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
        err,
        sourceId,
        tenantId,
        consecutiveErrors: newConsecutiveErrors,
        healthStatus,
      },
      "Ingestion job failed"
    );

    throw err;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Build a SourceConfig from the raw JSON stored in the database.
 */
function buildSourceConfig(raw: Record<string, unknown>): SourceConfig {
  const url = raw.url as string | undefined;
  if (!url) {
    throw new Error("Source config missing required field: url");
  }

  const config: SourceConfig = { url };

  if (raw.method) config.method = raw.method as "GET" | "POST" | "PUT";
  if (raw.headers) config.headers = raw.headers as Record<string, string>;
  if (raw.queryParams) config.queryParams = raw.queryParams as Record<string, string>;
  if (raw.body) config.body = raw.body;
  if (typeof raw.timeoutMs === "number") config.timeoutMs = raw.timeoutMs;
  if (typeof raw.incrementalSync === "boolean") config.incrementalSync = raw.incrementalSync;

  // Parse sub-configs using connector validators
  if (raw.auth) {
    config.auth = parseAuthConfig(raw.auth);
  }

  if (raw.pagination) {
    config.pagination = parsePaginationConfig(raw.pagination) ?? undefined;
  }

  if (raw.retry) {
    config.retry = parseRetryConfig(raw.retry);
  }

  if (raw.mapping) {
    config.mapping = parseFieldMapping(raw.mapping) ?? undefined;
  }

  // Rate limit config
  if (raw.rateLimit && typeof raw.rateLimit === "object") {
    const rl = raw.rateLimit as Record<string, unknown>;
    config.rateLimit = {
      maxRequests: (rl.maxRequests as number) ?? 60,
      windowMs: (rl.windowMs as number) ?? 60_000,
    };
  }

  // Circuit breaker config
  if (raw.circuitBreaker && typeof raw.circuitBreaker === "object") {
    const cb = raw.circuitBreaker as Record<string, unknown>;
    config.circuitBreaker = {
      failureThreshold: (cb.failureThreshold as number) ?? 5,
      recoveryTimeMs: (cb.recoveryTimeMs as number) ?? 60_000,
      successThreshold: (cb.successThreshold as number) ?? 2,
      monitoredStatusCodes: (cb.monitoredStatusCodes as number[]) ?? [500, 502, 503, 504],
    };
  }

  return config;
}

/**
 * Extract records array from a response body.
 * Handles both array responses and wrapped responses (data, results, items, etc.)
 */
function extractRecords(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const key of ["data", "results", "items", "records", "entries"]) {
      const value = obj[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
    // Single record
    return [obj];
  }
  return [];
}
