import Fastify, { type FastifyInstance } from "fastify";
import { config } from "@exosquad/config";
import { logger } from "@exosquad/logger";
import { AppError } from "@exosquad/common";
import { requestTrackerPlugin } from "./plugins/request-tracker.js";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { securityHeadersPlugin } from "./plugins/security-headers.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { sourceRoutes } from "./routes/sources.js";
import {
  productRoutes,
  brandRoutes,
  observationRoutes,
  normalizationErrorRoutes,
} from "./routes/canonical.js";
import {
  identityProductRoutes,
  identityCandidateRoutes,
  identityConflictRoutes,
  identityDecisionRoutes,
  identitySearchRoutes,
  identityMergeRoutes,
  identityTriggerRoutes,
} from "./routes/identity.js";
import {
  organizationRoutes,
  orgCandidateRoutes,
  orgConflictRoutes,
  orgDecisionRoutes,
  orgSearchRoutes,
  orgMergeRoutes,
  orgTriggerRoutes,
} from "./routes/organizations.js";
import {
  evidenceRoutes,
  claimRoutes,
  provenanceRoutes,
  evidenceGraphRoutes,
  evidenceConflictRoutes,
  calculationRoutes,
} from "./routes/evidence.js";
import {
  productDemandRoutes,
  marketDemandRoutes,
  signalDetailRoutes,
} from "./routes/demand.js";
import {
  opportunityRoutes,
  opportunityCalculationRoutes,
} from "./routes/opportunities.js";
import { authenticityRoutes } from "./routes/authenticity.js";
import { supplyChainRoutes } from "./routes/supply-chain.js";
import { logisticsRoutes } from "./routes/logistics.js";
import { pricingRoutes } from "./routes/pricing.js";
import { opportunityRoutes as productOpportunityRoutes } from "./routes/opportunity.js";
import { sourcingRoutes } from "./routes/sourcing.js";
import { researchRoutes } from "./routes/research.js";
import { outreachRoutes } from "./routes/outreach.js";

export class App {
  private server: FastifyInstance;

  constructor() {
    this.server = Fastify({
      logger: false, // We use our own Pino logger
      requestTimeout: 30_000,
      trustProxy: true,
    });

    this.registerPlugins();
    this.registerRoutes();
    this.registerErrorHandling();
  }

  private registerPlugins(): void {
    this.server.register(requestTrackerPlugin);
    this.server.register(authPlugin);
    this.server.register(rateLimitPlugin);
    this.server.register(securityHeadersPlugin);
  }

  private registerRoutes(): void {
    this.server.register(healthRoutes, { prefix: "/health" });
    this.server.register(authRoutes, { prefix: "/api/v1/auth" });
    this.server.register(sourceRoutes, { prefix: "/api/v1/sources" });
    this.server.register(productRoutes, { prefix: "/api/v1/products" });
    this.server.register(brandRoutes, { prefix: "/api/v1/brands" });
    this.server.register(observationRoutes, { prefix: "/api/v1/observations" });
    this.server.register(normalizationErrorRoutes, { prefix: "/api/v1/normalization-errors" });

    // Phase 4: Identity resolution routes
    this.server.register(identityProductRoutes, { prefix: "/api/v1/identity" });
    this.server.register(identityCandidateRoutes, { prefix: "/api/v1/identity" });
    this.server.register(identityConflictRoutes, { prefix: "/api/v1/identity" });
    this.server.register(identityDecisionRoutes, { prefix: "/api/v1/identity" });
    this.server.register(identitySearchRoutes, { prefix: "/api/v1/identity" });
    this.server.register(identityMergeRoutes, { prefix: "/api/v1/identity" });
    this.server.register(identityTriggerRoutes, { prefix: "/api/v1/identity" });

    // Phase 5: Organization entity routes
    this.server.register(organizationRoutes, { prefix: "/api/v1/organizations" });
    this.server.register(orgCandidateRoutes, { prefix: "/api/v1/organizations" });
    this.server.register(orgConflictRoutes, { prefix: "/api/v1/organizations" });
    this.server.register(orgDecisionRoutes, { prefix: "/api/v1/organizations" });
    this.server.register(orgSearchRoutes, { prefix: "/api/v1/organizations" });
    this.server.register(orgMergeRoutes, { prefix: "/api/v1/organizations" });
    this.server.register(orgTriggerRoutes, { prefix: "/api/v1/organizations" });

    // Phase 6: Evidence & Provenance routes
    this.server.register(evidenceRoutes, { prefix: "/api/v1/evidence" });
    this.server.register(claimRoutes, { prefix: "/api/v1/claims" });
    this.server.register(provenanceRoutes, { prefix: "/api/v1/provenance" });
    this.server.register(evidenceGraphRoutes, { prefix: "/api/v1/evidence" });
    this.server.register(evidenceConflictRoutes, { prefix: "/api/v1/evidence" });
    this.server.register(calculationRoutes, { prefix: "/api/v1/calculations" });

    // Phase 7: Demand & Trend Intelligence routes
    this.server.register(productDemandRoutes, { prefix: "/api/v1/products" });
    this.server.register(marketDemandRoutes, { prefix: "/api/v1/demand" });
    this.server.register(signalDetailRoutes, { prefix: "/api/v1/signals" });

    // Phase 8: Decision Intelligence & Reseller Opportunity Engine routes
    this.server.register(opportunityRoutes, { prefix: "/api/v1/opportunities" });
    this.server.register(opportunityCalculationRoutes, { prefix: "/api/v1/opportunity-calculations" });

    // Phase 8 (Original Roadmap): Authenticity Intelligence routes
    this.server.register(authenticityRoutes, { prefix: "/api/v1/authenticity" });

    // Phase 9: Supply-Chain Tracing & Provenance Graph routes
    this.server.register(supplyChainRoutes, { prefix: "/api/v1/supply-chain" });

    // Phase 10: Logistics & Routing Intelligence routes
    this.server.register(logisticsRoutes, { prefix: "/api/v1/logistics" });

    // Phase 11: Landed Cost, Pricing & Margin Intelligence routes
    this.server.register(pricingRoutes, { prefix: "/api/v1/pricing" });

    // Phase 12: Product Opportunity, Competition & Reseller Viability routes
    this.server.register(productOpportunityRoutes, { prefix: "/api/v1/opportunity" });

    // Phase 13: Supplier Discovery, Sourcing & Procurement Intelligence routes
    this.server.register(sourcingRoutes, { prefix: "/api/v1/sourcing" });

    // Phase 14: AI Research & Reasoning Engine routes
    this.server.register(researchRoutes, { prefix: "/api/v1/research" });

    // Phase 15: Supplier Outreach / Sourcing Intelligence routes
    this.server.register(outreachRoutes, { prefix: "/api/v1/outreach" });
  }

  private registerErrorHandling(): void {
    this.server.setErrorHandler((error: Error & { validation?: unknown }, request, reply) => {
      // Fastify validation errors (status 400 from schema validation)
      if (error.validation) {
        request.log.error({ err: error, url: request.url }, "Validation error");
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: error.message,
            details: error.validation,
          },
        });
      }

      // Known application errors
      if (error instanceof AppError) {
        request.log.error(
          { err: error, url: request.url, statusCode: error.statusCode },
          error.message
        );
        return reply.status(error.statusCode).send(error.toJSON());
      }

      // Unknown errors — never leak internals
      request.log.error({ err: error, url: request.url }, "Unhandled error");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      });
    });
  }

  async start(): Promise<void> {
    try {
      const address = await this.server.listen({
        port: config.PORT,
        host: "0.0.0.0",
      });
      logger.info({ address, port: config.PORT }, "EXOSQUAD API server started");
    } catch (err) {
      logger.fatal({ err }, "Failed to start API server");
      throw err;
    }
  }

  async stop(): Promise<void> {
    await this.server.close();
    logger.info("API server stopped");
  }

  /** Expose the Fastify instance for testing. */
  getServer(): FastifyInstance {
    return this.server;
  }
}
