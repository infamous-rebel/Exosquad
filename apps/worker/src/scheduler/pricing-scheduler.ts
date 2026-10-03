// =============================================================================
// Worker — Pricing Intelligence Scheduler (Phase 11)
// =============================================================================
// Periodically triggers pricing assessment, refresh, and expiration jobs.
// Runs after logistics scheduler to ensure Phase 10 data is available.
//
// Design principles:
// - Runs on a fixed interval (default: every 12 hours)
// - Enqueues pricing jobs per tenant
// - Idempotent: re-enqueuing is safe (processor handles deduplication)
// - Observable: logs every scheduling decision
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";

const PRICING_SCHEDULER_INTERVAL_MS = 60_000; // Check every 60 seconds
const PRICING_DETECTION_INTERVAL_HOURS = 12; // Run detection every 12 hours

/**
 * The PricingScheduler periodically enqueues pricing assessment,
 * refresh, and expiration jobs for all active tenants.
 */
export class PricingScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;
  private lastDetectionRun = 0;

  /**
   * Start the scheduler loop.
   */
  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Pricing scheduler already running");
      return;
    }

    this.queue = new Queue("pricing", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Pricing scheduler started");

    // Run immediately on startup, then every interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Pricing scheduler tick failed");
      });
    }, PRICING_SCHEDULER_INTERVAL_MS);
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
    logger.info("Pricing scheduler stopped");
  }

  /**
   * Single scheduler tick: check if detection/expiration is due and enqueue.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Pricing scheduler: previous tick still running — skipping");
      return;
    }

    this.running = true;
    const tickStart = Date.now();
    let tenantsChecked = 0;
    let jobsEnqueued = 0;

    try {
      const now = new Date();
      const hoursSinceLastRun =
        (now.getTime() - this.lastDetectionRun) / (1000 * 60 * 60);

      // Only run detection if enough time has passed
      if (hoursSinceLastRun >= PRICING_DETECTION_INTERVAL_HOURS) {
        // Find all active tenants
        const tenants = await prisma.tenant.findMany({
          select: { id: true, name: true },
        });

        for (const tenant of tenants) {
          tenantsChecked++;

          // Enqueue pricing assessment
          try {
            await this.queue!.add(
              "pricing:assess",
              {
                type: "pricing:assess",
                tenantId: tenant.id,
                productId: "ALL",
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `pricing-assess-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              },
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue pricing assess (may already be queued)",
            );
          }

          // Enqueue refresh
          try {
            await this.queue!.add(
              "pricing:refresh",
              {
                type: "pricing:refresh",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `pricing-refresh-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              },
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue pricing refresh",
            );
          }

          // Enqueue expiration
          try {
            await this.queue!.add(
              "pricing:expire",
              {
                type: "pricing:expire",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `pricing-expire-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              },
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue pricing expiration",
            );
          }
        }

        this.lastDetectionRun = now.getTime();
      }

      const elapsed = Date.now() - tickStart;
      if (tenantsChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { tenantsChecked, jobsEnqueued, elapsedMs: elapsed },
          "Pricing scheduler tick completed",
        );
      }
    } catch (err) {
      logger.error({ err }, "Pricing scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
