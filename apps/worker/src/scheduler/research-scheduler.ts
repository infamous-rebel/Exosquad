// =============================================================================
// Worker — AI Research Scheduler (Phase 14)
// =============================================================================
// Periodically checks for queued research requests and expired research.
// Runs on a fixed interval. Idempotent — re-enqueuing is safe.
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";
import { RESEARCH_CONFIG } from "@exosquad/common";

const RESEARCH_SCHEDULER_INTERVAL_MS = RESEARCH_CONFIG.researchCheckIntervalMs;

/**
 * The ResearchScheduler periodically enqueues research execution
 * and expiration jobs for all active tenants.
 */
export class ResearchScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;

  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Research scheduler already running");
      return;
    }

    this.queue = new Queue("research", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Research scheduler started");

    // Run immediately, then on interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Research scheduler tick failed");
      });
    }, RESEARCH_SCHEDULER_INTERVAL_MS);
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
    logger.info("Research scheduler stopped");
  }

  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Research scheduler: previous tick still running — skipping");
      return;
    }

    this.running = true;
    const tickStart = Date.now();
    let tenantsChecked = 0;
    let jobsEnqueued = 0;

    try {
      const now = new Date();

      // Find all active tenants
      const tenants = await prisma.tenant.findMany({
        select: { id: true, name: true },
      });

      for (const tenant of tenants) {
        tenantsChecked++;

        // Find queued research requests
        const queued = await prisma.researchRequest.findMany({
          where: { tenantId: tenant.id, status: "QUEUED" },
          orderBy: { priority: "asc" },
          take: RESEARCH_CONFIG.maxResearchJobsPerTenant,
        });

        for (const r of queued) {
          try {
            await this.queue!.add(
              "research:execute",
              {
                type: "research:execute",
                tenantId: tenant.id,
                requestId: r.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 2,
                backoff: { type: "exponential", delay: 10000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `research-execute-${r.id}`,
              },
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug(
              { tenantId: tenant.id, requestId: r.id, err },
              "Could not enqueue research execute (may already be queued)",
            );
          }
        }

        // Enqueue expiration check (once per tenant per tick)
        try {
          await this.queue!.add(
            "research:expire",
            {
              type: "research:expire",
              tenantId: tenant.id,
              triggeredBy: "scheduler",
            },
            {
              attempts: 1,
              removeOnComplete: { count: 100 },
              removeOnFail: { count: 1000 },
              jobId: `research-expire-${tenant.id}-${now.toISOString().slice(0, 10)}`,
            },
          );
          jobsEnqueued++;
        } catch (err) {
          logger.debug(
            { tenantId: tenant.id, err },
            "Could not enqueue research expire",
          );
        }
      }

      const elapsed = Date.now() - tickStart;
      if (tenantsChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { tenantsChecked, jobsEnqueued, elapsedMs: elapsed },
          "Research scheduler tick completed",
        );
      }
    } catch (err) {
      logger.error({ err }, "Research scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
