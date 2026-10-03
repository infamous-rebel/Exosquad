// =============================================================================
// Worker — Ingestion Scheduler
// =============================================================================
// Periodically scans active sources with scheduleCron expressions and enqueues
// ingestion jobs for those that are due.
//
// Design principles:
// - Minimal: no external cron library, no persistent scheduler state
// - Safe: uses the concurrent ingestion lock in the processor to prevent dupes
// - Idempotent: re-enqueuing a due source is safe (processor skips if locked)
// - Observable: logs every scheduling decision
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";
import { isSourceDue } from "./cron.js";

const SCHEDULER_INTERVAL_MS = 60_000; // Check every 60 seconds

/**
 * The IngestionScheduler polls the database for active sources with cron
 * schedules and enqueues ingestion jobs for those that are due.
 */
export class IngestionScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;

  /**
   * Start the scheduler loop.
   */
  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Scheduler already running");
      return;
    }

    this.queue = new Queue("ingestion", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Ingestion scheduler started");

    // Run immediately on startup, then every interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Scheduler tick failed");
      });
    }, SCHEDULER_INTERVAL_MS);
  }

  /**
   * Stop the scheduler loop.
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    logger.info("Ingestion scheduler stopped");
  }

  /**
   * Single scheduler tick: find due sources and enqueue jobs.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Previous tick still running — skipping");
      return;
    }

    this.running = true;
    const tickStart = Date.now();
    let sourcesChecked = 0;
    let jobsEnqueued = 0;

    try {
      // Find all active sources with a cron schedule
      const sources = await prisma.source.findMany({
        where: {
          status: "active",
          scheduleCron: { not: null },
        },
        select: {
          id: true,
          tenantId: true,
          name: true,
          scheduleCron: true,
          lastRunAt: true,
        },
      });

      const now = new Date();

      for (const source of sources) {
        sourcesChecked++;

        if (!source.scheduleCron) continue;

        // Check if the source is due based on cron expression
        if (!isSourceDue(source.scheduleCron, source.lastRunAt, now)) {
          continue;
        }

        // Enqueue ingestion job
        try {
          await this.queue!.add(
            "scheduled-ingest",
            {
              sourceId: source.id,
              tenantId: source.tenantId,
              triggeredBy: "scheduler",
            },
            {
              attempts: 3,
              backoff: { type: "exponential", delay: 5000 },
              removeOnComplete: { count: 1000 },
              removeOnFail: { count: 5000 },
              // Use sourceId as jobId to prevent duplicate queue entries
              jobId: `scheduled-${source.id}`,
            }
          );

          jobsEnqueued++;
          logger.info(
            { sourceId: source.id, sourceName: source.name, tenantId: source.tenantId },
            "Scheduled ingestion job enqueued"
          );
        } catch (err) {
          // Job may already be queued (BullMQ deduplicates by jobId)
          logger.debug(
            { sourceId: source.id, err },
            "Could not enqueue scheduled job (may already be queued)"
          );
        }
      }

      const elapsed = Date.now() - tickStart;
      if (sourcesChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { sourcesChecked, jobsEnqueued, elapsedMs: elapsed },
          "Scheduler tick completed"
        );
      }
    } catch (err) {
      logger.error({ err }, "Scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
