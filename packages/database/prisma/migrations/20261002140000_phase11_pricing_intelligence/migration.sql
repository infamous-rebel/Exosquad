-- CreateEnum
CREATE TYPE "PricingSourceType" AS ENUM ('SUPPLIER_QUOTE', 'MARKETPLACE_LISTING', 'WHOLESALE', 'RETAIL', 'DISTRIBUTOR', 'CUSTOMS_DECLARATION', 'TRADE_DATA', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceObservationType" AS ENUM ('PRODUCT_COST', 'FREIGHT', 'INSURANCE', 'DUTY', 'TAX', 'PORT_CHARGE', 'CUSTOMS_FEE', 'CLEARING_FEE', 'INLAND_TRANSPORT', 'WAREHOUSE', 'PLATFORM_FEE', 'COMMISSION', 'MARKETING', 'DELIVERY', 'SELLING_PRICE', 'COMPETITOR_PRICE', 'EXCHANGE_RATE', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceBasis" AS ENUM ('UNIT', 'PACK', 'CASE', 'CARTON', 'PALLET', 'CONTAINER', 'KG', 'LITER', 'OTHER');

-- CreateEnum
CREATE TYPE "CostComponentType" AS ENUM ('PRODUCT_COST', 'PACKAGING', 'INLAND_ORIGIN', 'EXPORT_HANDLING', 'FREIGHT', 'INSURANCE', 'PORT', 'CUSTOMS', 'DUTY', 'VAT', 'AIT', 'ATV', 'CD', 'SD', 'RD', 'CLEARING', 'INLAND_BANGLADESH', 'WAREHOUSE', 'PAYMENT', 'PLATFORM', 'OTHER');

-- CreateEnum
CREATE TYPE "CostStatus" AS ENUM ('OBSERVED', 'ESTIMATED', 'UNKNOWN', 'DISPUTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PricingCalculationStatus" AS ENUM ('PENDING', 'COMPLETE', 'STALE', 'CONTRADICTED', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "MarginType" AS ENUM ('GROSS_PROFIT', 'GROSS_MARGIN', 'MARKUP', 'NET_MARGIN', 'CONTRIBUTION_MARGIN');

-- CreateEnum
CREATE TYPE "PriceScenarioType" AS ENUM ('CONSERVATIVE', 'BASE', 'UPSIDE', 'IMPORT_WHOLESALE', 'IMPORT_RETAIL', 'MARKETPLACE', 'DISTRIBUTOR', 'DIRECT_TO_CONSUMER');

-- CreateEnum
CREATE TYPE "PricingRiskType" AS ENUM ('UNKNOWN_FREIGHT', 'UNKNOWN_DUTY', 'UNKNOWN_TAX', 'UNKNOWN_CLEARING', 'CURRENCY_UNCERTAINTY', 'HIGH_LOGISTICS_COST', 'SUPPLIER_PRICE_UNCERTAINTY', 'INSUFFICIENT_PRICE_OBSERVATIONS', 'LARGE_PRICE_SPREAD', 'STALE_OBSERVATIONS', 'RAPID_PRICE_CHANGE', 'SPECIFICATION_INCONSISTENCY', 'PACKAGE_SIZE_MISMATCH', 'INCOMPARABLE_UNITS', 'INSUFFICIENT_MARGIN_INPUTS', 'SELLING_BELOW_COST', 'HIGH_PLATFORM_FEES', 'HIGH_DELIVERY_COST', 'NARROW_MARGIN_RANGE');

-- CreateEnum
CREATE TYPE "PriceTrendDirection" AS ENUM ('RISING', 'STABLE', 'DECLINING', 'VOLATILE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PriceConfidenceBand" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "PricePositionType" AS ENUM ('BELOW_MARKET', 'LOWER_MARKET', 'MID_MARKET', 'UPPER_MARKET', 'ABOVE_MARKET', 'UNKNOWN');

-- CreateTable
CREATE TABLE "price_observations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "sourceType" "PricingSourceType" NOT NULL,
    "observationType" "PriceObservationType" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "moq" DOUBLE PRECISION,
    "priceBasis" "PriceBasis" NOT NULL DEFAULT 'UNIT',
    "market" TEXT,
    "country" TEXT,
    "sourceUrl" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "evidenceId" TEXT,
    "normalizedUnitPrice" DOUBLE PRECISION,
    "normalizedCurrency" TEXT,
    "exchangeRateEvidenceId" TEXT,
    "exchangeRateObservedAt" TIMESTAMP(3),
    "packSize" DOUBLE PRECISION,
    "perUnitQuantity" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "contentHash" TEXT NOT NULL,
    "parserVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_components" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "logisticsRouteId" TEXT,
    "type" "CostComponentType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "basis" "PriceBasis" NOT NULL DEFAULT 'UNIT',
    "quantity" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "rateType" TEXT,
    "status" "CostStatus" NOT NULL DEFAULT 'OBSERVED',
    "evidenceId" TEXT,
    "observedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landed_cost_calculations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "logisticsRouteId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "productCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freightCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insuranceCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dutyCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "portCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clearingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "destinationCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitLandedCost" DOUBLE PRECISION,
    "status" "PricingCalculationStatus" NOT NULL DEFAULT 'PENDING',
    "unknownComponentFlags" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "componentIds" JSONB NOT NULL DEFAULT '[]',
    "observationIds" JSONB NOT NULL DEFAULT '[]',
    "exchangeRateEvidenceId" TEXT,
    "exchangeRateUsed" DOUBLE PRECISION,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'PRICING_ALGORITHM_V1',
    "inputHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landed_cost_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_scenarios" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "landedCostCalculationId" TEXT NOT NULL,
    "scenarioType" "PriceScenarioType" NOT NULL,
    "sellingPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "platformFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marketingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warehouseCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherSellingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalVariableCost" DOUBLE PRECISION,
    "grossProfit" DOUBLE PRECISION,
    "grossMargin" DOUBLE PRECISION,
    "markup" DOUBLE PRECISION,
    "breakEvenPrice" DOUBLE PRECISION,
    "targetMargin" DOUBLE PRECISION,
    "targetPrice" DOUBLE PRECISION,
    "pricePosition" "PricePositionType" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PricingCalculationStatus" NOT NULL DEFAULT 'PENDING',
    "unknownInputFlags" JSONB NOT NULL DEFAULT '[]',
    "observationIds" JSONB NOT NULL DEFAULT '[]',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'PRICING_ALGORITHM_V1',
    "contentHash" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_price_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'BD',
    "currency" TEXT NOT NULL,
    "observationCount" INTEGER NOT NULL,
    "comparableCount" INTEGER NOT NULL,
    "incomparableCount" INTEGER NOT NULL,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "medianPrice" DOUBLE PRECISION,
    "averagePrice" DOUBLE PRECISION,
    "lowerQuartile" DOUBLE PRECISION,
    "upperQuartile" DOUBLE PRECISION,
    "priceSpread" DOUBLE PRECISION,
    "spreadPercentage" DOUBLE PRECISION,
    "trendDirection" "PriceTrendDirection" NOT NULL DEFAULT 'UNKNOWN',
    "priceVolatility" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observationIds" JSONB NOT NULL DEFAULT '[]',
    "contentHash" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'PRICING_ALGORITHM_V1',
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_risks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "riskType" "PricingRiskType" NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "affectedInput" TEXT NOT NULL,
    "affectedEntityId" TEXT,
    "affectedEntityType" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "status" "PricingCalculationStatus" NOT NULL DEFAULT 'PENDING',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'PRICING_ALGORITHM_V1',
    "inputHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "costComponentCount" INTEGER NOT NULL DEFAULT 0,
    "landedCostCount" INTEGER NOT NULL DEFAULT 0,
    "scenarioCount" INTEGER NOT NULL DEFAULT 0,
    "marketSnapshotCount" INTEGER NOT NULL DEFAULT 0,
    "riskCount" INTEGER NOT NULL DEFAULT 0,
    "overallConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallPriceVolatility" DOUBLE PRECISION,
    "overallTrendDirection" "PriceTrendDirection" NOT NULL DEFAULT 'UNKNOWN',
    "landedCostIds" JSONB NOT NULL DEFAULT '[]',
    "scenarioIds" JSONB NOT NULL DEFAULT '[]',
    "marketSnapshotIds" JSONB NOT NULL DEFAULT '[]',
    "observationIds" JSONB NOT NULL DEFAULT '[]',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_observations_tenantId_idx" ON "price_observations"("tenantId");

-- CreateIndex
CREATE INDEX "price_observations_productId_idx" ON "price_observations"("productId");

-- CreateIndex
CREATE INDEX "price_observations_supplierId_idx" ON "price_observations"("supplierId");

-- CreateIndex
CREATE INDEX "price_observations_sourceType_idx" ON "price_observations"("sourceType");

-- CreateIndex
CREATE INDEX "price_observations_observationType_idx" ON "price_observations"("observationType");

-- CreateIndex
CREATE INDEX "price_observations_contentHash_idx" ON "price_observations"("contentHash");

-- CreateIndex
CREATE INDEX "price_observations_observedAt_idx" ON "price_observations"("observedAt");

-- CreateIndex
CREATE INDEX "price_observations_currency_idx" ON "price_observations"("currency");

-- CreateIndex
CREATE INDEX "price_observations_market_idx" ON "price_observations"("market");

-- CreateIndex
CREATE INDEX "price_observations_country_idx" ON "price_observations"("country");

-- CreateIndex
CREATE INDEX "price_observations_evidenceId_idx" ON "price_observations"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "price_observations_tenantId_productId_sourceType_observatio_key" ON "price_observations"("tenantId", "productId", "sourceType", "observationType", "contentHash");

-- CreateIndex
CREATE INDEX "cost_components_tenantId_idx" ON "cost_components"("tenantId");

-- CreateIndex
CREATE INDEX "cost_components_productId_idx" ON "cost_components"("productId");

-- CreateIndex
CREATE INDEX "cost_components_supplierId_idx" ON "cost_components"("supplierId");

-- CreateIndex
CREATE INDEX "cost_components_logisticsRouteId_idx" ON "cost_components"("logisticsRouteId");

-- CreateIndex
CREATE INDEX "cost_components_type_idx" ON "cost_components"("type");

-- CreateIndex
CREATE INDEX "cost_components_status_idx" ON "cost_components"("status");

-- CreateIndex
CREATE INDEX "cost_components_contentHash_idx" ON "cost_components"("contentHash");

-- CreateIndex
CREATE INDEX "cost_components_observedAt_idx" ON "cost_components"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "cost_components_tenantId_productId_type_supplierId_logistic_key" ON "cost_components"("tenantId", "productId", "type", "supplierId", "logisticsRouteId", "contentHash");

-- CreateIndex
CREATE INDEX "landed_cost_calculations_tenantId_idx" ON "landed_cost_calculations"("tenantId");

-- CreateIndex
CREATE INDEX "landed_cost_calculations_productId_idx" ON "landed_cost_calculations"("productId");

-- CreateIndex
CREATE INDEX "landed_cost_calculations_supplierId_idx" ON "landed_cost_calculations"("supplierId");

-- CreateIndex
CREATE INDEX "landed_cost_calculations_logisticsRouteId_idx" ON "landed_cost_calculations"("logisticsRouteId");

-- CreateIndex
CREATE INDEX "landed_cost_calculations_status_idx" ON "landed_cost_calculations"("status");

-- CreateIndex
CREATE INDEX "landed_cost_calculations_inputHash_idx" ON "landed_cost_calculations"("inputHash");

-- CreateIndex
CREATE INDEX "landed_cost_calculations_contentHash_idx" ON "landed_cost_calculations"("contentHash");

-- CreateIndex
CREATE INDEX "landed_cost_calculations_calculatedAt_idx" ON "landed_cost_calculations"("calculatedAt");

-- CreateIndex
CREATE INDEX "landed_cost_calculations_version_idx" ON "landed_cost_calculations"("version");

-- CreateIndex
CREATE UNIQUE INDEX "landed_cost_calculations_tenantId_productId_supplierId_logi_key" ON "landed_cost_calculations"("tenantId", "productId", "supplierId", "logisticsRouteId", "version");

-- CreateIndex
CREATE INDEX "pricing_scenarios_tenantId_idx" ON "pricing_scenarios"("tenantId");

-- CreateIndex
CREATE INDEX "pricing_scenarios_productId_idx" ON "pricing_scenarios"("productId");

-- CreateIndex
CREATE INDEX "pricing_scenarios_landedCostCalculationId_idx" ON "pricing_scenarios"("landedCostCalculationId");

-- CreateIndex
CREATE INDEX "pricing_scenarios_scenarioType_idx" ON "pricing_scenarios"("scenarioType");

-- CreateIndex
CREATE INDEX "pricing_scenarios_status_idx" ON "pricing_scenarios"("status");

-- CreateIndex
CREATE INDEX "pricing_scenarios_contentHash_idx" ON "pricing_scenarios"("contentHash");

-- CreateIndex
CREATE INDEX "pricing_scenarios_calculatedAt_idx" ON "pricing_scenarios"("calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_scenarios_tenantId_productId_landedCostCalculationI_key" ON "pricing_scenarios"("tenantId", "productId", "landedCostCalculationId", "scenarioType", "contentHash");

-- CreateIndex
CREATE INDEX "market_price_snapshots_tenantId_idx" ON "market_price_snapshots"("tenantId");

-- CreateIndex
CREATE INDEX "market_price_snapshots_productId_idx" ON "market_price_snapshots"("productId");

-- CreateIndex
CREATE INDEX "market_price_snapshots_market_idx" ON "market_price_snapshots"("market");

-- CreateIndex
CREATE INDEX "market_price_snapshots_country_idx" ON "market_price_snapshots"("country");

-- CreateIndex
CREATE INDEX "market_price_snapshots_snapshotDate_idx" ON "market_price_snapshots"("snapshotDate");

-- CreateIndex
CREATE INDEX "market_price_snapshots_contentHash_idx" ON "market_price_snapshots"("contentHash");

-- CreateIndex
CREATE INDEX "market_price_snapshots_trendDirection_idx" ON "market_price_snapshots"("trendDirection");

-- CreateIndex
CREATE UNIQUE INDEX "market_price_snapshots_tenantId_productId_market_snapshotDa_key" ON "market_price_snapshots"("tenantId", "productId", "market", "snapshotDate", "contentHash");

-- CreateIndex
CREATE INDEX "pricing_risks_tenantId_idx" ON "pricing_risks"("tenantId");

-- CreateIndex
CREATE INDEX "pricing_risks_assessmentId_idx" ON "pricing_risks"("assessmentId");

-- CreateIndex
CREATE INDEX "pricing_risks_riskType_idx" ON "pricing_risks"("riskType");

-- CreateIndex
CREATE INDEX "pricing_risks_severity_idx" ON "pricing_risks"("severity");

-- CreateIndex
CREATE INDEX "pricing_risks_detectedAt_idx" ON "pricing_risks"("detectedAt");

-- CreateIndex
CREATE INDEX "pricing_assessments_tenantId_idx" ON "pricing_assessments"("tenantId");

-- CreateIndex
CREATE INDEX "pricing_assessments_productId_idx" ON "pricing_assessments"("productId");

-- CreateIndex
CREATE INDEX "pricing_assessments_supplierId_idx" ON "pricing_assessments"("supplierId");

-- CreateIndex
CREATE INDEX "pricing_assessments_status_idx" ON "pricing_assessments"("status");

-- CreateIndex
CREATE INDEX "pricing_assessments_overallConfidence_idx" ON "pricing_assessments"("overallConfidence");

-- CreateIndex
CREATE INDEX "pricing_assessments_inputHash_idx" ON "pricing_assessments"("inputHash");

-- CreateIndex
CREATE INDEX "pricing_assessments_calculatedAt_idx" ON "pricing_assessments"("calculatedAt");

-- CreateIndex
CREATE INDEX "pricing_assessments_version_idx" ON "pricing_assessments"("version");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_assessments_tenantId_productId_supplierId_version_key" ON "pricing_assessments"("tenantId", "productId", "supplierId", "version");

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_components" ADD CONSTRAINT "cost_components_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_components" ADD CONSTRAINT "cost_components_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_calculations" ADD CONSTRAINT "landed_cost_calculations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landed_cost_calculations" ADD CONSTRAINT "landed_cost_calculations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_scenarios" ADD CONSTRAINT "pricing_scenarios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_scenarios" ADD CONSTRAINT "pricing_scenarios_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_scenarios" ADD CONSTRAINT "pricing_scenarios_landedCostCalculationId_fkey" FOREIGN KEY ("landedCostCalculationId") REFERENCES "landed_cost_calculations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_price_snapshots" ADD CONSTRAINT "market_price_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_price_snapshots" ADD CONSTRAINT "market_price_snapshots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_risks" ADD CONSTRAINT "pricing_risks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_risks" ADD CONSTRAINT "pricing_risks_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "pricing_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_assessments" ADD CONSTRAINT "pricing_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

