// =============================================================================
// Worker — Authenticity Scheduler (Phase 8 — Original Roadmap)
// =============================================================================
// Periodically triggers authenticity detection and expiration jobs.
// Runs after evidence generation to ensure fresh evidence is available.
//
// Design principles:
// - Runs on a fixed interval (default: every 12 hours)
// - Enqueues authenticity:detect and authenticity:expire jobs per tenant
// - Idempotent: re-enqueuing is safe (processor handles deduplication)
// - Observable: logs every scheduling decision
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";

const AUTHENTICITY_SCHEDULER_INTERVAL_MS = 60_000; // Check every 60 seconds
const AUTHENTICITY_DETECTION_INTERVAL_HOURS = 12; // Run detection every 12 hours

/**
 * The AuthenticityScheduler periodically enqueues authenticity detection
 * and expiration jobs for all active tenants.
 */
export class AuthenticityScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;
  private lastDetectionRun = 0;

  /**
   * Start the scheduler loop.
   */
  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Authenticity scheduler already running");
      return;
    }

    this.queue = new Queue("authenticity_intelligence", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Authenticity scheduler started");

    // Run immediately on startup, then every interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Authenticity scheduler tick failed");
      });
    }, AUTHENTICITY_SCHEDULER_INTERVAL_MS);
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
    logger.info("Authenticity scheduler stopped");
  }

  /**
   * Single scheduler tick: check if detection/expiration is due and enqueue.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Authenticity scheduler: previous tick still running — skipping");
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
      if (hoursSinceLastRun >= AUTHENTICITY_DETECTION_INTERVAL_HOURS) {
        // Find all active tenants
        const tenants = await prisma.tenant.findMany({
          select: { id: true, name: true },
        });

        for (const tenant of tenants) {
          tenantsChecked++;

          // Enqueue authenticity detection job
          try {
            await this.queue!.add(
              "authenticity:detect",
              {
                type: "authenticity:detect",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `auth-detect-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );

            jobsEnqueued++;
            logger.info(
              { tenantId: tenant.id, tenantName: tenant.name },
              "Authenticity detection job enqueued"
            );
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue authenticity detection (may already be queued)"
            );
          }

          // Enqueue authenticity expiration job
          try {
            await this.queue!.add(
              "authenticity:expire",
              {
                type: "authenticity:expire",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `auth-expire-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );

            jobsEnqueued++;
            logger.info(
              { tenantId: tenant.id, tenantName: tenant.name },
              "Authenticity expiration job enqueued"
            );
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue authenticity expiration (may already be queued)"
            );
          }
        }

        this.lastDetectionRun = now.getTime();
      }

      const elapsed = Date.now() - tickStart;
      if (tenantsChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { tenantsChecked, jobsEnqueued, elapsedMs: elapsed },
          "Authenticity scheduler tick completed"
        );
      }
    } catch (err) {
      logger.error({ err }, "Authenticity scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
