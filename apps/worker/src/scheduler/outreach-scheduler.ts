// =============================================================================
// Worker — Supplier Outreach Intelligence Scheduler (Phase 15)
// =============================================================================
// Periodically triggers outreach expiration and follow-up reminder jobs.
// Runs after the research scheduler.
// =============================================================================

import { prisma } from "@exosquad/database";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue } from "bullmq";
import { OUTREACH_CONFIG } from "@exosquad/common";

const SCHEDULER_INTERVAL_MS = 60_000; // Check every 60 seconds
const DETECTION_INTERVAL_HOURS = OUTREACH_CONFIG.detectionIntervalHours;
const MAX_JOBS_PER_TENANT = OUTREACH_CONFIG.maxJobsPerTenant;

/**
 * The OutreachScheduler periodically enqueues outreach expiration
 * and follow-up reminder jobs for all active tenants.
 */
export class OutreachScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private queue: Queue | null = null;
  private running = false;
  private lastDetectionRun = 0;

  async start(): Promise<void> {
    if (this.timer) {
      logger.warn("Outreach scheduler already running");
      return;
    }

    this.queue = new Queue("supplier_outreach", {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
      },
    });

    logger.info("Outreach scheduler started");

    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error({ err }, "Outreach scheduler tick failed");
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
    logger.info("Outreach scheduler stopped");
  }

  private async tick(): Promise<void> {
    if (this.running) {
      logger.debug("Outreach scheduler: previous tick still running — skipping");
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

          // Enqueue expiration job
          try {
            await this.queue!.add(
              "outreach:expire",
              {
                type: "outreach:expire",
                tenantId: tenant.id,
                triggeredBy: "scheduler",
              },
              {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
                jobId: `outreach-expire-${tenant.id}-${dayKey}`,
              },
            );
            jobsEnqueued++;
          } catch (err) {
            logger.debug({ tenantId: tenant.id, err }, "Could not enqueue outreach expire");
          }

          // Find outreachs with overdue follow-ups
          const overdueCutoff = new Date(
            now.getTime() - OUTREACH_CONFIG.stalenessThresholds.followupOverdueDays * 86400000,
          );

          const outreachsWithOverdueFollowups = await prisma.outreachFollowup.findMany({
            where: {
              tenantId: tenant.id,
              completedAt: null,
              dueAt: { lt: overdueCutoff },
            },
            select: { outreachId: true },
            distinct: ["outreachId"],
            take: MAX_JOBS_PER_TENANT,
          });

          for (const { outreachId } of outreachsWithOverdueFollowups) {
            try {
              await this.queue!.add(
                "outreach:analyze-response",
                {
                  type: "outreach:analyze-response",
                  tenantId: tenant.id,
                  outreachId,
                  triggeredBy: "scheduler",
                },
                {
                  attempts: 3,
                  backoff: { type: "exponential", delay: 5000 },
                  removeOnComplete: { count: 1000 },
                  removeOnFail: { count: 5000 },
                  jobId: `outreach-followup-${tenant.id}-${outreachId}-${dayKey}`,
                },
              );
              jobsEnqueued++;
            } catch (err) {
              logger.debug(
                { tenantId: tenant.id, outreachId, err },
                "Could not enqueue outreach follow-up analysis",
              );
            }
          }
        }

        this.lastDetectionRun = now.getTime();
      }

      const elapsed = Date.now() - tickStart;
      if (tenantsChecked > 0 || jobsEnqueued > 0) {
        logger.info(
          { tenantsChecked, jobsEnqueued, elapsedMs: elapsed },
          "Outreach scheduler tick completed",
        );
      }
    } catch (err) {
      logger.error({ err }, "Outreach scheduler tick error");
    } finally {
      this.running = false;
    }
  }
}
