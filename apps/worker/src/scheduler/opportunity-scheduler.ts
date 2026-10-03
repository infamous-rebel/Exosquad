// =============================================================================
// Worker — Opportunity Scheduler (Phase 8)
// =============================================================================
// Periodically triggers opportunity detection and expiration jobs.
// Runs after demand intelligence calculations to ensure fresh signals.
//
// Design principles:
// - Runs on a fixed interval (default: every 6 hours)
// - Enqueues opportunity:detect and opportunity:expire jobs per tenant
// - Idempotent: re-enqueuing is safe (processor handles deduplication)
// - Observable: logs every scheduling decision
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";

const OPPORTUNITY_SCHEDULER_INTERVAL_MS = 60_000; // Check every 60 seconds
const OPPORTUNITY_DETECTION_INTERVAL_HOURS = 6; // Run detection every 6 hours

/**
 * The OpportunityScheduler periodically enqueues opportunity detection
 * and expiration jobs for all active tenants.
 */
export class OpportunityScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;
  private lastDetectionRun = 0;

  /**
   * Start the scheduler loop.
   */
  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Opportunity scheduler already running");
      return;
    }

    this.queue = new Queue("decision_intelligence", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Opportunity scheduler started");

    // Run immediately on startup, then every interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Opportunity scheduler tick failed");
      });
    }, OPPORTUNITY_SCHEDULER_INTERVAL_MS);
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
    logger.info("Opportunity scheduler stopped");
  }

  /**
   * Single scheduler tick: check if detection/expiration is due and enqueue.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Opportunity scheduler: previous tick still running — skipping");
      return;
    }

    this.running = true;
    const tickStart = Date.now();
    let tenantsChecked = 0;
    let jobsEnqueued = 0;

    try {
      const now = new Date();
      const hoursSinceLastRun = (now.getTime() - this.lastDetectionRun) / (1000 * 60 * 60);

      // Only run detection if enough time has passed
      if (hoursSinceLastRun >= OPPORTUNITY_DETECTION_INTERVAL_HOURS) {
        // Find all active tenants
        const tenants = await prisma.tenant.findMany({
          select: { id: true, name: true },
        });

        for (const tenant of tenants) {
          tenantsChecked++;

          // Enqueue opportunity detection job
          try {
            await this.queue!.add(
              "opportunity:detect",
              {
                type: "opportunity:detect",
                tenantId: tenant.id,
                windowDays: 30,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `opp-detect-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );

            jobsEnqueued++;
            logger.info(
              { tenantId: tenant.id, tenantName: tenant.name },
              "Opportunity detection job enqueued"
            );
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue opportunity detection (may already be queued)"
            );
          }

          // Enqueue opportunity expiration job
          try {
            await this.queue!.add(
              "opportunity:expire",
              {
                type: "opportunity:expire",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `opp-expire-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );

            jobsEnqueued++;
            logger.info(
              { tenantId: tenant.id, tenantName: tenant.name },
              "Opportunity expiration job enqueued"
            );
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue opportunity expiration (may already be queued)"
            );
          }
        }

        this.lastDetectionRun = now.getTime();
      }

      const elapsed = Date.now() - tickStart;
      if (tenantsChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { tenantsChecked, jobsEnqueued, elapsedMs: elapsed },
          "Opportunity scheduler tick completed"
        );
      }
    } catch (err) {
      logger.error({ err }, "Opportunity scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
