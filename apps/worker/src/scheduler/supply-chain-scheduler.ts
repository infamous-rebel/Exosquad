// =============================================================================
// Worker — Supply-Chain Scheduler (Phase 9)
// =============================================================================
// Periodically triggers supply-chain detection, recalculation, and expiration
// jobs. Runs after evidence generation to ensure fresh evidence is available.
//
// Design principles:
// - Runs on a fixed interval (default: every 12 hours)
// - Enqueues supply-chain jobs per tenant
// - Idempotent: re-enqueuing is safe (processor handles deduplication)
// - Observable: logs every scheduling decision
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";

const SUPPLY_CHAIN_SCHEDULER_INTERVAL_MS = 60_000; // Check every 60 seconds
const SUPPLY_CHAIN_DETECTION_INTERVAL_HOURS = 12; // Run detection every 12 hours

/**
 * The SupplyChainScheduler periodically enqueues supply-chain detection,
 * conflict detection, anomaly detection, and expiration jobs for all
 * active tenants.
 */
export class SupplyChainScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;
  private lastDetectionRun = 0;

  /**
   * Start the scheduler loop.
   */
  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Supply-chain scheduler already running");
      return;
    }

    this.queue = new Queue("supply_chain", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Supply-chain scheduler started");

    // Run immediately on startup, then every interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Supply-chain scheduler tick failed");
      });
    }, SUPPLY_CHAIN_SCHEDULER_INTERVAL_MS);
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
    logger.info("Supply-chain scheduler stopped");
  }

  /**
   * Single scheduler tick: check if detection/expiration is due and enqueue.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Supply-chain scheduler: previous tick still running — skipping");
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
      if (hoursSinceLastRun >= SUPPLY_CHAIN_DETECTION_INTERVAL_HOURS) {
        // Find all active tenants
        const tenants = await prisma.tenant.findMany({
          select: { id: true, name: true },
        });

        for (const tenant of tenants) {
          tenantsChecked++;

          // Enqueue supply-chain build job
          try {
            await this.queue!.add(
              "supply-chain:build",
              {
                type: "supply-chain:build",
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
                jobId: `sc-build-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue supply-chain build (may already be queued)"
            );
          }

          // Enqueue conflict detection
          try {
            await this.queue!.add(
              "supply-chain:detect-conflicts",
              {
                type: "supply-chain:detect-conflicts",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `sc-conflicts-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue supply-chain conflict detection"
            );
          }

          // Enqueue anomaly detection
          try {
            await this.queue!.add(
              "supply-chain:detect-anomalies",
              {
                type: "supply-chain:detect-anomalies",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `sc-anomalies-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue supply-chain anomaly detection"
            );
          }

          // Enqueue expiration
          try {
            await this.queue!.add(
              "supply-chain:expire",
              {
                type: "supply-chain:expire",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `sc-expire-${tenant.id}-${now.toISOString().slice(0, 10)}`,
              }
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue supply-chain expiration"
            );
          }
        }

        this.lastDetectionRun = now.getTime();
      }

      const elapsed = Date.now() - tickStart;
      if (tenantsChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { tenantsChecked, jobsEnqueued, elapsedMs: elapsed },
          "Supply-chain scheduler tick completed"
        );
      }
    } catch (err) {
      logger.error({ err }, "Supply-chain scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
