// =============================================================================
// Worker — Product Opportunity Intelligence Scheduler (Phase 12)
// =============================================================================
// Periodically triggers product opportunity assessment, refresh, and expiration
// jobs. Runs after the pricing scheduler so Phase 11 landed costs are available.
//
// Design principles:
// - Runs on a fixed interval (default: every 12 hours)
// - Enqueues jobs per tenant; assess jobs are scoped to products with fresh
//   upstream data (competitor observations / demand signals)
// - Idempotent: deterministic jobIds prevent duplicate runs per day
// - Observable: logs every scheduling decision
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";

const OPP_SCHEDULER_INTERVAL_MS = 60_000; // Check every 60 seconds
const OPP_DETECTION_INTERVAL_HOURS = 12; // Run detection every 12 hours
const MAX_ASSESS_JOBS_PER_TENANT = 20; // Cap per cycle to avoid flooding

/**
 * The ProductOpportunityScheduler periodically enqueues opportunity
 * assessment, refresh, and expiration jobs for all active tenants.
 */
export class ProductOpportunityScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;
  private lastDetectionRun = 0;

  /**
   * Start the scheduler loop.
   */
  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Product opportunity scheduler already running");
      return;
    }

    this.queue = new Queue("product_opportunity", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Product opportunity scheduler started");

    // Run immediately on startup, then every interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Product opportunity scheduler tick failed");
      });
    }, OPP_SCHEDULER_INTERVAL_MS);
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
    logger.info("Product opportunity scheduler stopped");
  }

  /**
   * Single scheduler tick: check if detection/expiration is due and enqueue.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Product opportunity scheduler: previous tick still running — skipping");
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
      const dayKey = now.toISOString().slice(0, 10);

      // Only run detection if enough time has passed
      if (hoursSinceLastRun >= OPP_DETECTION_INTERVAL_HOURS) {
        // Find all active tenants
        const tenants = await prisma.tenant.findMany({
          select: { id: true, name: true },
        });

        for (const tenant of tenants) {
          tenantsChecked++;

          // Find products with recent competitor observations or demand
          // signals that need assessment (candidates for assess jobs).
          const candidateCutoff = new Date(
            now.getTime() - OPP_DETECTION_INTERVAL_HOURS * 2 * 60 * 60 * 1000,
          );
          const recentCompetitorProducts = await prisma.competitorObservation.findMany({
            where: { tenantId: tenant.id, observedAt: { gte: candidateCutoff } },
            select: { productId: true },
            distinct: ["productId"],
            take: MAX_ASSESS_JOBS_PER_TENANT,
          });

          for (const { productId } of recentCompetitorProducts) {
            try {
              await this.queue!.add(
                "product-opportunity:assess",
                {
                  type: "product-opportunity:assess",
                  tenantId: tenant.id,
                  productId,
                  triggeredBy: "scheduler",
                },
                {
                  attempts: 3,
                  backoff: { type: "exponential", delay: 5000 },
                  removeOnComplete: { count: 1000 },
                  removeOnFail: { count: 5000 },
                  jobId: `product-opp-assess-${tenant.id}-${productId}-${dayKey}`,
                },
              );
              jobsEnqueued++;
            } catch (err) {
              logger.debug(
                { tenantId: tenant.id, productId, err },
                "Could not enqueue product opportunity assess (may already be queued)",
              );
            }
          }

          // Enqueue refresh (re-assesses products with stale assessments)
          try {
            await this.queue!.add(
              "product-opportunity:refresh",
              {
                type: "product-opportunity:refresh",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `product-opp-refresh-${tenant.id}-${dayKey}`,
              },
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue product opportunity refresh",
            );
          }

          // Enqueue expiration
          try {
            await this.queue!.add(
              "product-opportunity:expire",
              {
                type: "product-opportunity:expire",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `product-opp-expire-${tenant.id}-${dayKey}`,
              },
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, err },
              "Could not enqueue product opportunity expiration",
            );
          }
        }

        this.lastDetectionRun = now.getTime();
      }

      const elapsed = Date.now() - tickStart;
      if (tenantsChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { tenantsChecked, jobsEnqueued, elapsedMs: elapsed },
          "Product opportunity scheduler tick completed",
        );
      }
    } catch (err) {
      logger.error({ err }, "Product opportunity scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
