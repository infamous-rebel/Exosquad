import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { processIngestionJob } from "../processors/ingestion.js";
import { processNormalizationJob } from "../processors/normalization.js";

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
