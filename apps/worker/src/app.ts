import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { QueueManager } from "./queues/queue-manager.js";
import { IngestionScheduler } from "./scheduler/scheduler.js";
import { OpportunityScheduler } from "./scheduler/opportunity-scheduler.js";
import { AuthenticityScheduler } from "./scheduler/authenticity-scheduler.js";
import { SupplyChainScheduler } from "./scheduler/supply-chain-scheduler.js";
import { LogisticsScheduler } from "./scheduler/logistics-scheduler.js";
import { PricingScheduler } from "./scheduler/pricing-scheduler.js";
import { ProductOpportunityScheduler } from "./scheduler/product-opportunity-scheduler.js";
import { SupplierSourcingScheduler } from "./scheduler/supplier-sourcing-scheduler.js";
import { ResearchScheduler } from "./scheduler/research-scheduler.js";
import { OutreachScheduler } from "./scheduler/outreach-scheduler.js";

/**
 * Worker application.
 * Runs BullMQ job processors and exposes a minimal health endpoint.
 */
export class WorkerApp {
  private queueManager: QueueManager;
  private scheduler: IngestionScheduler;
  private opportunityScheduler: OpportunityScheduler;
  private authenticityScheduler: AuthenticityScheduler;
  private supplyChainScheduler: SupplyChainScheduler;
  private logisticsScheduler: LogisticsScheduler;
  private pricingScheduler: PricingScheduler;
  private productOpportunityScheduler: ProductOpportunityScheduler;
  private supplierSourcingScheduler: SupplierSourcingScheduler;
  private researchScheduler: ResearchScheduler;
  private outreachScheduler: OutreachScheduler;
  private healthServer: ReturnType<typeof Fastify>;

  constructor() {
    this.queueManager = new QueueManager();
    this.scheduler = new IngestionScheduler();
    this.opportunityScheduler = new OpportunityScheduler();
    this.authenticityScheduler = new AuthenticityScheduler();
    this.supplyChainScheduler = new SupplyChainScheduler();
    this.logisticsScheduler = new LogisticsScheduler();
    this.pricingScheduler = new PricingScheduler();
    this.productOpportunityScheduler = new ProductOpportunityScheduler();
    this.supplierSourcingScheduler = new SupplierSourcingScheduler();
    this.researchScheduler = new ResearchScheduler();
    this.outreachScheduler = new OutreachScheduler();

    // Minimal HTTP server for health checks (separate port from API)
    this.healthServer = Fastify({ logger: false });

    this.healthServer.get("/health", async () => ({
      status: "ok",
      service: "exosquad-worker",
      timestamp: new Date().toISOString(),
    }));

    this.healthServer.get("/health/ready", async (_request: FastifyRequest, reply: FastifyReply) => {
      const queueStats = await this.queueManager.getStats();
      const allHealthy = Object.values(queueStats).every(
        (s) => s.status === "ok"
      );

      return reply.status(allHealthy ? 200 : 503).send({
        status: allHealthy ? "ok" : "degraded",
        service: "exosquad-worker",
        timestamp: new Date().toISOString(),
        queues: queueStats,
      });
    });
  }

  async start(): Promise<void> {
    // Start all queue processors
    await this.queueManager.start();

    // Start the ingestion scheduler (polls for cron-due sources)
    await this.scheduler.start();

    // Start the opportunity scheduler (Phase 8 — runs after demand calculations)
    await this.opportunityScheduler.start();

    // Start the authenticity scheduler (Phase 8 Original — runs after evidence generation)
    await this.authenticityScheduler.start();

    // Start the supply-chain scheduler (Phase 9 — runs after evidence generation)
    await this.supplyChainScheduler.start();

    // Start the logistics scheduler (Phase 10 — runs after supply-chain)
    await this.logisticsScheduler.start();

    // Start the pricing scheduler (Phase 11 — runs after logistics)
    await this.pricingScheduler.start();

    // Start the product opportunity scheduler (Phase 12 — runs after pricing)
    await this.productOpportunityScheduler.start();

    // Start the supplier sourcing scheduler (Phase 13 — runs after product opportunity)
    await this.supplierSourcingScheduler.start();

    // Start the research scheduler (Phase 14 — runs after supplier sourcing)
    await this.researchScheduler.start();

    // Start the outreach scheduler (Phase 15 — runs after research)
    await this.outreachScheduler.start();

    // Start health check server on API port + 1
    const healthPort = config.PORT + 1;
    await this.healthServer.listen({ port: healthPort, host: "0.0.0.0" });

    logger.info(
      { healthPort },
      "EXOSQUAD Worker started with health endpoint"
    );
  }

  async stop(): Promise<void> {
    await this.outreachScheduler.stop();
    await this.researchScheduler.stop();
    await this.supplierSourcingScheduler.stop();
    await this.productOpportunityScheduler.stop();
    await this.pricingScheduler.stop();
    await this.logisticsScheduler.stop();
    await this.supplyChainScheduler.stop();
    await this.authenticityScheduler.stop();
    await this.opportunityScheduler.stop();
    await this.scheduler.stop();
    await this.queueManager.stop();
    await this.healthServer.close();
    logger.info("Worker stopped");
  }
}
