-- CreateEnum
CREATE TYPE "ProductOppSignalType" AS ENUM ('STRONG_DEMAND_GROWTH', 'WEAK_DEMAND', 'DEMAND_DECLINE', 'DEMAND_VOLATILITY', 'SEASONALITY_DETECTED', 'LOW_COMPETITOR_DENSITY', 'HIGH_COMPETITION', 'MARKET_SATURATION', 'PRICE_COMPRESSION', 'WIDE_PRICE_SPREAD', 'HIGH_PRICE_VOLATILITY', 'MULTIPLE_SUPPLIER_OPTIONS', 'HIGH_SUPPLIER_CONCENTRATION', 'SUPPLIER_DIVERSITY', 'HIGH_LOGISTICS_COMPLEXITY', 'LOGISTICS_UNCERTAINTY', 'NARROW_MARGIN_RANGE', 'LOW_MARGIN', 'HIGH_LANDED_COST', 'LOW_DATA_COMPLETENESS', 'SPECIFICATION_AMBIGUITY', 'PRICE_ANOMALY');

-- CreateEnum
CREATE TYPE "CompetitionLevel" AS ENUM ('VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CompetitionStructure" AS ENUM ('MONOPOLY', 'DUOPOLY', 'OLIGOPOLY', 'COMPETITIVE', 'FRAGMENTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DemandMomentum" AS ENUM ('ACCELERATING', 'GROWING', 'STABLE', 'DECLINING', 'VOLATILE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MarketSaturationLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SupplierConcentrationLevel" AS ENUM ('DIVERSIFIED', 'MODERATELY_CONCENTRATED', 'CONCENTRATED', 'HIGHLY_CONCENTRATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PriceCompetitionLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ResellerViabilityBand" AS ENUM ('VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ProductOppRiskType" AS ENUM ('WEAK_DEMAND', 'DEMAND_DECLINE', 'HIGH_COMPETITION', 'MARKET_SATURATION', 'LOW_MARGIN', 'HIGH_PRICE_VOLATILITY', 'SUPPLIER_CONCENTRATION', 'LOGISTICS_COMPLEXITY', 'SUPPLY_UNCERTAINTY', 'INSUFFICIENT_DATA', 'SPECIFICATION_AMBIGUITY', 'SEASONALITY_RISK', 'PRICE_COMPRESSION', 'HIGH_LANDED_COST');

-- CreateEnum
CREATE TYPE "ProductOppStatus" AS ENUM ('DETECTED', 'VALIDATED', 'WATCH', 'ACTIONABLE', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OpportunityConfidenceBand" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "DataCompletenessBand" AS ENUM ('HIGH', 'MODERATE', 'LOW', 'VERY_LOW', 'UNKNOWN');

-- CreateTable
CREATE TABLE "competitor_observations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "competitorName" TEXT,
    "competitorProductName" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "market" TEXT,
    "country" TEXT,
    "sellingPrice" DOUBLE PRECISION,
    "currency" TEXT,
    "priceBasis" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "availability" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "evidenceId" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueCompetitorCount" INTEGER NOT NULL DEFAULT 0,
    "activeCompetitorCount" INTEGER NOT NULL DEFAULT 0,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "medianPrice" DOUBLE PRECISION,
    "priceSpread" DOUBLE PRECISION,
    "marketConcentration" DOUBLE PRECISION,
    "competitionLevel" "CompetitionLevel" NOT NULL DEFAULT 'UNKNOWN',
    "priceCompetitionLevel" "PriceCompetitionLevel" NOT NULL DEFAULT 'UNKNOWN',
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_opportunity_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "demandLevel" TEXT,
    "demandMomentum" "DemandMomentum" NOT NULL DEFAULT 'UNKNOWN',
    "searchGrowth" DOUBLE PRECISION,
    "seasonality" DOUBLE PRECISION,
    "trendStrength" DOUBLE PRECISION,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_opportunity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_opp_signals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "signalType" "ProductOppSignalType" NOT NULL,
    "direction" TEXT NOT NULL,
    "magnitude" DOUBLE PRECISION,
    "evidence" TEXT NOT NULL,
    "sourceReferences" JSONB NOT NULL DEFAULT '[]',
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_opp_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_opp_risks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "riskType" "ProductOppRiskType" NOT NULL,
    "severity" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "affectedDimension" TEXT NOT NULL,
    "evidenceReferences" JSONB NOT NULL DEFAULT '[]',
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_opp_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reseller_viability_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "demandLevel" TEXT,
    "demandMomentum" "DemandMomentum" NOT NULL DEFAULT 'UNKNOWN',
    "demandConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "competitionLevel" "CompetitionLevel" NOT NULL DEFAULT 'UNKNOWN',
    "competitionStructure" "CompetitionStructure" NOT NULL DEFAULT 'UNKNOWN',
    "uniqueCompetitors" INTEGER,
    "activeListings" INTEGER,
    "competitionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierCount" INTEGER,
    "supplierDiversity" TEXT,
    "supplierConcentration" "SupplierConcentrationLevel" NOT NULL DEFAULT 'UNKNOWN',
    "supplyConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "routeCount" INTEGER,
    "logisticsComplexity" TEXT,
    "logisticsConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitLandedCost" DOUBLE PRECISION,
    "marketPriceMin" DOUBLE PRECISION,
    "marketPriceMax" DOUBLE PRECISION,
    "marketPriceMedian" DOUBLE PRECISION,
    "grossMarginMin" DOUBLE PRECISION,
    "grossMarginMax" DOUBLE PRECISION,
    "pricingConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marketSaturation" "MarketSaturationLevel" NOT NULL DEFAULT 'UNKNOWN',
    "priceCompression" BOOLEAN NOT NULL DEFAULT false,
    "dataCompleteness" "DataCompletenessBand" NOT NULL DEFAULT 'UNKNOWN',
    "commercialRisk" TEXT,
    "operationalRisk" TEXT,
    "status" "ProductOppStatus" NOT NULL DEFAULT 'DETECTED',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'OPPORTUNITY_ALGORITHM_V1',
    "inputHash" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "signalIds" JSONB NOT NULL DEFAULT '[]',
    "riskIds" JSONB NOT NULL DEFAULT '[]',
    "competitorSnapshotId" TEXT,
    "demandSnapshotId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),

    CONSTRAINT "reseller_viability_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competitor_observations_tenantId_idx" ON "competitor_observations"("tenantId");

-- CreateIndex
CREATE INDEX "competitor_observations_productId_idx" ON "competitor_observations"("productId");

-- CreateIndex
CREATE INDEX "competitor_observations_sourceType_idx" ON "competitor_observations"("sourceType");

-- CreateIndex
CREATE INDEX "competitor_observations_market_idx" ON "competitor_observations"("market");

-- CreateIndex
CREATE INDEX "competitor_observations_country_idx" ON "competitor_observations"("country");

-- CreateIndex
CREATE INDEX "competitor_observations_observedAt_idx" ON "competitor_observations"("observedAt");

-- CreateIndex
CREATE INDEX "competitor_observations_contentHash_idx" ON "competitor_observations"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_observations_tenantId_productId_sourceType_conte_key" ON "competitor_observations"("tenantId", "productId", "sourceType", "contentHash");

-- CreateIndex
CREATE INDEX "competitor_snapshots_tenantId_idx" ON "competitor_snapshots"("tenantId");

-- CreateIndex
CREATE INDEX "competitor_snapshots_productId_idx" ON "competitor_snapshots"("productId");

-- CreateIndex
CREATE INDEX "competitor_snapshots_snapshotDate_idx" ON "competitor_snapshots"("snapshotDate");

-- CreateIndex
CREATE INDEX "competitor_snapshots_competitionLevel_idx" ON "competitor_snapshots"("competitionLevel");

-- CreateIndex
CREATE INDEX "competitor_snapshots_contentHash_idx" ON "competitor_snapshots"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_snapshots_tenantId_productId_snapshotDate_conten_key" ON "competitor_snapshots"("tenantId", "productId", "snapshotDate", "contentHash");

-- CreateIndex
CREATE INDEX "demand_opportunity_snapshots_tenantId_idx" ON "demand_opportunity_snapshots"("tenantId");

-- CreateIndex
CREATE INDEX "demand_opportunity_snapshots_productId_idx" ON "demand_opportunity_snapshots"("productId");

-- CreateIndex
CREATE INDEX "demand_opportunity_snapshots_snapshotDate_idx" ON "demand_opportunity_snapshots"("snapshotDate");

-- CreateIndex
CREATE INDEX "demand_opportunity_snapshots_demandMomentum_idx" ON "demand_opportunity_snapshots"("demandMomentum");

-- CreateIndex
CREATE INDEX "demand_opportunity_snapshots_contentHash_idx" ON "demand_opportunity_snapshots"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "demand_opportunity_snapshots_tenantId_productId_snapshotDat_key" ON "demand_opportunity_snapshots"("tenantId", "productId", "snapshotDate", "contentHash");

-- CreateIndex
CREATE INDEX "product_opp_signals_tenantId_idx" ON "product_opp_signals"("tenantId");

-- CreateIndex
CREATE INDEX "product_opp_signals_productId_idx" ON "product_opp_signals"("productId");

-- CreateIndex
CREATE INDEX "product_opp_signals_signalType_idx" ON "product_opp_signals"("signalType");

-- CreateIndex
CREATE INDEX "product_opp_signals_direction_idx" ON "product_opp_signals"("direction");

-- CreateIndex
CREATE INDEX "product_opp_signals_detectedAt_idx" ON "product_opp_signals"("detectedAt");

-- CreateIndex
CREATE INDEX "product_opp_signals_contentHash_idx" ON "product_opp_signals"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "product_opp_signals_tenantId_productId_signalType_contentHa_key" ON "product_opp_signals"("tenantId", "productId", "signalType", "contentHash");

-- CreateIndex
CREATE INDEX "product_opp_risks_tenantId_idx" ON "product_opp_risks"("tenantId");

-- CreateIndex
CREATE INDEX "product_opp_risks_productId_idx" ON "product_opp_risks"("productId");

-- CreateIndex
CREATE INDEX "product_opp_risks_riskType_idx" ON "product_opp_risks"("riskType");

-- CreateIndex
CREATE INDEX "product_opp_risks_severity_idx" ON "product_opp_risks"("severity");

-- CreateIndex
CREATE INDEX "product_opp_risks_detectedAt_idx" ON "product_opp_risks"("detectedAt");

-- CreateIndex
CREATE INDEX "product_opp_risks_contentHash_idx" ON "product_opp_risks"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "product_opp_risks_tenantId_productId_riskType_contentHash_key" ON "product_opp_risks"("tenantId", "productId", "riskType", "contentHash");

-- CreateIndex
CREATE INDEX "reseller_viability_assessments_tenantId_idx" ON "reseller_viability_assessments"("tenantId");

-- CreateIndex
CREATE INDEX "reseller_viability_assessments_productId_idx" ON "reseller_viability_assessments"("productId");

-- CreateIndex
CREATE INDEX "reseller_viability_assessments_status_idx" ON "reseller_viability_assessments"("status");

-- CreateIndex
CREATE INDEX "reseller_viability_assessments_inputHash_idx" ON "reseller_viability_assessments"("inputHash");

-- CreateIndex
CREATE INDEX "reseller_viability_assessments_contentHash_idx" ON "reseller_viability_assessments"("contentHash");

-- CreateIndex
CREATE INDEX "reseller_viability_assessments_calculatedAt_idx" ON "reseller_viability_assessments"("calculatedAt");

-- CreateIndex
CREATE INDEX "reseller_viability_assessments_version_idx" ON "reseller_viability_assessments"("version");

-- CreateIndex
CREATE UNIQUE INDEX "reseller_viability_assessments_tenantId_productId_version_key" ON "reseller_viability_assessments"("tenantId", "productId", "version");

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "competitor_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_opportunity_snapshots" ADD CONSTRAINT "demand_opportunity_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_opp_signals" ADD CONSTRAINT "product_opp_signals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_opp_risks" ADD CONSTRAINT "product_opp_risks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reseller_viability_assessments" ADD CONSTRAINT "reseller_viability_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

