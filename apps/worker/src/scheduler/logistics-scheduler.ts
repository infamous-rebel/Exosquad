// =============================================================================
// Worker — Logistics Intelligence Scheduler (Phase 10)
// =============================================================================
// Periodically triggers logistics graph building, route calculation,
// conflict/anomaly detection, refresh, and expiration jobs.
// Runs after supply-chain scheduler to ensure Phase 9 data is available.
//
// Design principles:
// - Runs on a fixed interval (default: every 12 hours)
// - Enqueues logistics jobs per tenant
// - Idempotent: re-enqueuing is safe (processor handles deduplication)
// - Observable: logs every scheduling decision
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";

const LOGISTICS_SCHEDULER_INTERVAL_MS = 60_000; // Check every 60 seconds
const LOGISTICS_DETECTION_INTERVAL_HOURS = 12; // Run detection every 12 hours

/**
 * The LogisticsScheduler periodically enqueues logistics graph building,
 * route calculation, conflict detection, anomaly detection, refresh,
 * and expiration jobs for all active tenants.
 */
export class LogisticsScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;
  private lastDetectionRun = 0;

  /**
   * Start the scheduler loop.
   */
  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Logistics scheduler already running");
      return;
    }

    this.queue = new Queue("logistics", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Logistics scheduler started");

    // Run immediately on startup, then every interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Logistics scheduler tick failed");
      });
    }, LOGISTICS_SCHEDULER_INTERVAL_MS);
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
    logger.info("Logistics scheduler stopped");
  }

  /**
   * Single scheduler tick: check if detection/expiration is due and enqueue.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Logistics scheduler: previous tick still running — skipping");
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
      if (hoursSinceLastRun >= LOGISTICS_DETECTION_INTERVAL_HOURS) {
        // Find all active tenants
        const tenants = await prisma.tenant.findMany({
          select: { id: true, name: true },
        });

        for (const tenant of tenants) {
          tenantsChecked++;

          // Enqueue logistics build job
          try {
            await this.queue!.add(
              "logistics:build",
              {
                type: "logistics:build",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `lg-build-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue logistics build (may already be queued)"
            );
          }

          // Enqueue route calculation
          try {
            await this.queue!.add(
              "logistics:calculate-routes",
              {
                type: "logistics:calculate-routes",
                tenantId: tenant.id,
                subjectType: "ALL",
                subjectId: "ALL",
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `lg-calc-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue logistics calculate-routes"
            );
          }

          // Enqueue conflict detection
          try {
            await this.queue!.add(
              "logistics:detect-conflicts",
              {
                type: "logistics:detect-conflicts",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `lg-conflicts-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue logistics conflict detection"
            );
          }

          // Enqueue anomaly detection
          try {
            await this.queue!.add(
              "logistics:detect-anomalies",
              {
                type: "logistics:detect-anomalies",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `lg-anomalies-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue logistics anomaly detection"
            );
          }

          // Enqueue refresh
          try {
            await this.queue!.add(
              "logistics:refresh",
              {
                type: "logistics:refresh",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `lg-refresh-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue logistics refresh"
            );
          }

          // Enqueue expiration
          try {
            await this.queue!.add(
              "logistics:expire",
              {
                type: "logistics:expire",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `lg-expire-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue logistics expiration"
            );
          }
        }

        this.lastDetectionRun = now.getTime();
      }

      const elapsed = Date.now() - tickStart;
      if (tenantsChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { tenantsChecked, jobsEnqueued, elapsedMs: elapsed },
          "Logistics scheduler tick completed"
        );
      }
    } catch (err) {
      logger.error({ err }, "Logistics scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
