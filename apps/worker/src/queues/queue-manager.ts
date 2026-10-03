import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { processIngestionJob } from "../processors/ingestion.js";
import { processNormalizationJob } from "../processors/normalization.js";
import { processIdentityJob } from "../processors/identity.js";
import { processOrgEntityJob } from "../processors/org-entity.js";
import { processEvidenceJob } from "../processors/evidence.js";
import { processDemandJob } from "../processors/demand.js";
import { processOpportunityJob } from "../processors/opportunity.js";
import { processAuthenticityJob } from "../processors/authenticity.js";
import { processSupplyChainJob } from "../processors/supply-chain.js";
import { processLogisticsJob } from "../processors/logistics.js";
import { processPricingJob } from "../processors/pricing.js";
import { processProductOpportunityJob } from "../processors/product-opportunity.js";
import { processSupplierSourcingJob } from "../processors/supplier-sourcing.js";
import { processResearchJob } from "../processors/research.js";
import { processOutreachJob } from "../processors/outreach.js";

/** BullMQ connection options shared across all queues and workers. */
const connection: ConnectionOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required by BullMQ
};

/**
 * Manages all BullMQ queues and workers.
 * Each queue has a dedicated worker with appropriate concurrency and retry settings.
 */
export class QueueManager {
  private workers: Worker[] = [];
  private queues: Map<string, Queue> = new Map();

  async start(): Promise<void> {
    // ─── Ingestion Queue ─────────────────────────────────────────────────
    const ingestionQueue = new Queue("ingestion", { connection });
    this.queues.set("ingestion", ingestionQueue);

    const ingestionWorker = new Worker("ingestion", processIngestionJob, {
      connection,
      concurrency: config.WORKER_CONCURRENCY,
      limiter: {
        max: 50,
        duration: 60_000, // Max 50 jobs per minute
      },
    });

    this.attachWorkerEvents(ingestionWorker, "ingestion");
    this.workers.push(ingestionWorker);

    // ─── Normalization Queue ─────────────────────────────────────────────
    const normalizationQueue = new Queue("normalization", { connection });
    this.queues.set("normalization", normalizationQueue);

    const normalizationWorker = new Worker(
      "normalization",
      processNormalizationJob,
      {
        connection,
        concurrency: config.WORKER_CONCURRENCY,
      }
    );

    this.attachWorkerEvents(normalizationWorker, "normalization");
    this.workers.push(normalizationWorker);

    // ─── Identity Resolution Queue ──────────────────────────────────────
    const identityQueue = new Queue("identity_resolution", { connection });
    this.queues.set("identity_resolution", identityQueue);

    const identityWorker = new Worker(
      "identity_resolution",
      processIdentityJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
      }
    );

    this.attachWorkerEvents(identityWorker, "identity_resolution");
    this.workers.push(identityWorker);

    // ─── Org Entity Resolution Queue ────────────────────────────────────
    const orgEntityQueue = new Queue("org_entity_resolution", { connection });
    this.queues.set("org_entity_resolution", orgEntityQueue);

    const orgEntityWorker = new Worker(
      "org_entity_resolution",
      processOrgEntityJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
      }
    );

    this.attachWorkerEvents(orgEntityWorker, "org_entity_resolution");
    this.workers.push(orgEntityWorker);

    // ─── Evidence Generation Queue ───────────────────────────────────────
    const evidenceQueue = new Queue("evidence_generation", { connection });
    this.queues.set("evidence_generation", evidenceQueue);

    const evidenceWorker = new Worker(
      "evidence_generation",
      processEvidenceJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
      }
    );

    this.attachWorkerEvents(evidenceWorker, "evidence_generation");
    this.workers.push(evidenceWorker);

    // ─── Demand Intelligence Queue ─────────────────────────────────────────
    const demandQueue = new Queue("demand_intelligence", { connection });
    this.queues.set("demand_intelligence", demandQueue);

    const demandWorker = new Worker(
      "demand_intelligence",
      processDemandJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
        limiter: {
          max: 30,
          duration: 60_000, // Max 30 jobs per minute
        },
      }
    );

    this.attachWorkerEvents(demandWorker, "demand_intelligence");
    this.workers.push(demandWorker);

    // ─── Decision Intelligence Queue ──────────────────────────────────────
    const decisionQueue = new Queue("decision_intelligence", { connection });
    this.queues.set("decision_intelligence", decisionQueue);

    const decisionWorker = new Worker(
      "decision_intelligence",
      processOpportunityJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
        limiter: {
          max: 20,
          duration: 60_000, // Max 20 jobs per minute
        },
      }
    );

    this.attachWorkerEvents(decisionWorker, "decision_intelligence");
    this.workers.push(decisionWorker);

    // ─── Authenticity Intelligence Queue ─────────────────────────────────────
    const authenticityQueue = new Queue("authenticity_intelligence", { connection });
    this.queues.set("authenticity_intelligence", authenticityQueue);

    const authenticityWorker = new Worker(
      "authenticity_intelligence",
      processAuthenticityJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
        limiter: {
          max: 20,
          duration: 60_000, // Max 20 jobs per minute
        },
      }
    );

    this.attachWorkerEvents(authenticityWorker, "authenticity_intelligence");
    this.workers.push(authenticityWorker);

    // ─── Supply-Chain Intelligence Queue ──────────────────────────────────────
    const supplyChainQueue = new Queue("supply_chain", { connection });
    this.queues.set("supply_chain", supplyChainQueue);

    const supplyChainWorker = new Worker(
      "supply_chain",
      processSupplyChainJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
        limiter: {
          max: 20,
          duration: 60_000, // Max 20 jobs per minute
        },
      }
    );

    this.attachWorkerEvents(supplyChainWorker, "supply_chain");
    this.workers.push(supplyChainWorker);

    // ─── Logistics Intelligence Queue (Phase 10) ─────────────────────────────
    const logisticsQueue = new Queue("logistics", { connection });
    this.queues.set("logistics", logisticsQueue);

    const logisticsWorker = new Worker(
      "logistics",
      processLogisticsJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
        limiter: {
          max: 20,
          duration: 60_000, // Max 20 jobs per minute
        },
      }
    );

    this.attachWorkerEvents(logisticsWorker, "logistics");
    this.workers.push(logisticsWorker);

    // ─── Pricing Intelligence Queue (Phase 11) ────────────────────────────
    const pricingQueue = new Queue("pricing", { connection });
    this.queues.set("pricing", pricingQueue);

    const pricingWorker = new Worker(
      "pricing",
      processPricingJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
        limiter: {
          max: 20,
          duration: 60_000, // Max 20 jobs per minute
        },
      }
    );

    this.attachWorkerEvents(pricingWorker, "pricing");
    this.workers.push(pricingWorker);

    // ─── Product Opportunity Intelligence Queue (Phase 12) ────────────────
    const productOpportunityQueue = new Queue("product_opportunity", { connection });
    this.queues.set("product_opportunity", productOpportunityQueue);

    const productOpportunityWorker = new Worker(
      "product_opportunity",
      processProductOpportunityJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
        limiter: {
          max: 20,
          duration: 60_000, // Max 20 jobs per minute
        },
      }
    );

    this.attachWorkerEvents(productOpportunityWorker, "product_opportunity");
    this.workers.push(productOpportunityWorker);

    // ─── Supplier Sourcing Intelligence Queue (Phase 13) ──────────────────
    const supplierSourcingQueue = new Queue("supplier_sourcing", { connection });
    this.queues.set("supplier_sourcing", supplierSourcingQueue);

    const supplierSourcingWorker = new Worker(
      "supplier_sourcing",
      processSupplierSourcingJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
        limiter: {
          max: 20,
          duration: 60_000, // Max 20 jobs per minute
        },
      }
    );

    this.attachWorkerEvents(supplierSourcingWorker, "supplier_sourcing");
    this.workers.push(supplierSourcingWorker);

    // ─── AI Research Intelligence Queue (Phase 14) ───────────────────────
    const researchQueue = new Queue("research", { connection });
    this.queues.set("research", researchQueue);

    const researchWorker = new Worker(
      "research",
      processResearchJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 4)),
        limiter: {
          max: 10,
          duration: 60_000, // Max 10 research jobs per minute (expensive)
        },
      },
    );

    this.attachWorkerEvents(researchWorker, "research");
    this.workers.push(researchWorker);

    // ─── Supplier Outreach Intelligence Queue (Phase 15) ─────────────────
    const outreachQueue = new Queue("supplier_outreach", { connection });
    this.queues.set("supplier_outreach", outreachQueue);

    const outreachWorker = new Worker(
      "supplier_outreach",
      processOutreachJob,
      {
        connection,
        concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
        limiter: {
          max: 20,
          duration: 60_000, // Max 20 outreach jobs per minute
        },
      },
    );

    this.attachWorkerEvents(outreachWorker, "supplier_outreach");
    this.workers.push(outreachWorker);

    logger.info(
      { queueCount: this.queues.size, workerCount: this.workers.length },
      "All queues and workers started"
    );
  }

  /**
   * Add a job to a named queue.
   */
  async addJob(
    queueName: string,
    jobName: string,
    data: Record<string, unknown>,
    options?: {
      priority?: number;
      attempts?: number;
      backoff?: { type: string; delay: number };
      delay?: number;
      jobId?: string;
    }
  ): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Unknown queue: ${queueName}`);
    }

    const job = await queue.add(jobName, data, {
      priority: options?.priority ?? 0,
      attempts: options?.attempts ?? 3,
      backoff: options?.backoff ?? { type: "exponential", delay: 1000 },
      delay: options?.delay,
      jobId: options?.jobId,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });

    logger.info(
      { queue: queueName, jobName, jobId: job.id },
      "Job enqueued"
    );

    return job.id!;
  }

  /**
   * Get queue statistics for health checks.
   */
  async getStats(): Promise<
    Record<string, { status: string; waiting: number; active: number; failed: number }>
  > {
    const stats: Record<
      string,
      { status: string; waiting: number; active: number; failed: number }
    > = {};

    for (const [name, queue] of this.queues) {
      try {
        const [waiting, active, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getFailedCount(),
        ]);
        stats[name] = { status: "ok", waiting, active, failed };
      } catch {
        stats[name] = { status: "error", waiting: 0, active: 0, failed: 0 };
      }
    }

    return stats;
  }

  async stop(): Promise<void> {
    logger.info("Stopping all workers...");

    for (const worker of this.workers) {
      await worker.close();
    }

    for (const queue of this.queues.values()) {
      await queue.close();
    }

    logger.info("All workers and queues closed");
  }

  private attachWorkerEvents(worker: Worker, queueName: string): void {
    worker.on("completed", (job: Job) => {
      logger.info(
        { queue: queueName, jobId: job.id, duration: job.finishedOn! - job.processedOn! },
        "Job completed"
      );
    });

    worker.on("failed", (job: Job | undefined, err: Error) => {
      logger.error(
        {
          queue: queueName,
          jobId: job?.id,
          attemptsMade: job?.attemptsMade,
          err,
        },
        "Job failed"
      );
    });

    worker.on("error", (err: Error) => {
      logger.error({ queue: queueName, err }, "Worker error");
    });
  }
}
