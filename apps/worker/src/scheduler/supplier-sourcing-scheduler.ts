// =============================================================================
// Worker — Supplier Sourcing Intelligence Scheduler (Phase 13)
// =============================================================================
// Periodically triggers supplier sourcing assessment, refresh, and expiration
// jobs. Runs after the product opportunity scheduler.
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";
import { SOURCING_CONFIG } from "@exosquad/common";

const SCHEDULER_INTERVAL_MS = 60_000; // Check every 60 seconds
const DETECTION_INTERVAL_HOURS = SOURCING_CONFIG.detectionIntervalHours;
const MAX_ASSESS_JOBS_PER_TENANT = SOURCING_CONFIG.maxAssessJobsPerTenant;

/**
 * The SupplierSourcingScheduler periodically enqueues supplier sourcing
 * assessment, refresh, and expiration jobs for all active tenants.
 */
export class SupplierSourcingScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;
  private lastDetectionRun = 0;

  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Supplier sourcing scheduler already running");
      return;
    }

    this.queue = new Queue("supplier_sourcing", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Supplier sourcing scheduler started");

    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Supplier sourcing scheduler tick failed");
      });
    }, SCHEDULER_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    logger.info("Supplier sourcing scheduler stopped");
  }

  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Supplier sourcing scheduler: previous tick still running — skipping");
      return;
    }

    this.running = true;
    const tickStart = Date.now();
    let tenantsChecked = 0;
    let jobsEnqueued = 0;

    try {
      const now = new Date();
      const hoursSinceLastRun = (now.getTime() - this.lastDetectionRun) / (1000 * 60 * 60);
      const dayKey = now.toISOString().slice(0, 10);

      if (hoursSinceLastRun >= DETECTION_INTERVAL_HOURS) {
        const tenants = await prisma.tenant.findMany({
          select: { id: true, name: true },
        });

        for (const tenant of tenants) {
          tenantsChecked++;

          // Find products with recent ProductSupplier links
          const candidateCutoff = new Date(
            now.getTime() - DETECTION_INTERVAL_HOURS * 2 * 60 * 60 * 1000,
          );
          const recentSupplierProducts = await prisma.productSupplier.findMany({
            where: { tenantId: tenant.id, observedAt: { gte: candidateCutoff } },
            select: { productId: true },
            distinct: ["productId"],
            take: MAX_ASSESS_JOBS_PER_TENANT,
          });

          for (const { productId } of recentSupplierProducts) {
            try {
              await this.queue!.add(
                "supplier-sourcing:assess",
                {
                  type: "supplier-sourcing:assess",
                  tenantId: tenant.id,
                  productId,
                  triggeredBy: "scheduler",
                },
                {
                  attempts: 3,
                  backoff: { type: "exponential", delay: 5000 },
                  removeOnComplete: { count: 1000 },
                  removeOnFail: { count: 5000 },
                  jobId: `supplier-sourcing-assess-${tenant.id}-${productId}-${dayKey}`,
                },
              );
              jobsEnqueued++;
            } catch (err) {
              logger.debug(
                { tenantId: tenant.id, productId, err },
                "Could not enqueue supplier sourcing assess",
              );
            }
          }

          // Enqueue refresh
          try {
            await this.queue!.add(
              "supplier-sourcing:refresh",
              {
                type: "supplier-sourcing:refresh",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `supplier-sourcing-refresh-${tenant.id}-${dayKey}`,
              },
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug({ tenantId: tenant.id, err }, "Could not enqueue supplier sourcing refresh");
          }

          // Enqueue expiration
          try {
            await this.queue!.add(
              "supplier-sourcing:expire",
              {
                type: "supplier-sourcing:expire",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `supplier-sourcing-expire-${tenant.id}-${dayKey}`,
              },
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug({ tenantId: tenant.id, err }, "Could not enqueue supplier sourcing expire");
          }
        }

        this.lastDetectionRun = now.getTime();
      }

      const elapsed = Date.now() - tickStart;
      if (tenantsChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { tenantsChecked, jobsEnqueued, elapsedMs: elapsed },
          "Supplier sourcing scheduler tick completed",
        );
      }
    } catch (err) {
      logger.error({ err }, "Supplier sourcing scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
