-- CreateTable
CREATE TABLE "demand_signals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT,
    "productVariantId" TEXT,
    "brandId" TEXT,
    "sellerId" TEXT,
    "sourceId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "signalType" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "originalValue" DOUBLE PRECISION,
    "unit" TEXT,
    "currency" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "granularity" TEXT NOT NULL DEFAULT 'day',
    "geography" TEXT NOT NULL DEFAULT 'global',
    "country" TEXT,
    "marketplace" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "freshness" TEXT NOT NULL DEFAULT 'unknown',
    "observationStatus" TEXT NOT NULL DEFAULT 'observed',
    "dataQuality" TEXT NOT NULL DEFAULT 'valid',
    "sourceReliability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" TEXT NOT NULL DEFAULT 'active',
    "contentHash" TEXT,
    "isOutlier" BOOLEAN NOT NULL DEFAULT false,
    "outlierMethod" TEXT,
    "outlierScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_calculations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "calculationType" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'product',
    "entityId" TEXT NOT NULL,
    "productId" TEXT,
    "productVariantId" TEXT,
    "brandId" TEXT,
    "result" JSONB NOT NULL,
    "resultSummary" TEXT,
    "units" TEXT,
    "currency" TEXT,
    "windowDays" INTEGER,
    "granularity" TEXT,
    "geography" TEXT NOT NULL DEFAULT 'global',
    "country" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "dataSufficiency" TEXT NOT NULL DEFAULT 'unknown',
    "freshness" TEXT NOT NULL DEFAULT 'unknown',
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "inputSignalIds" JSONB NOT NULL DEFAULT '[]',
    "inputCalculationIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demand_signals_tenantId_idx" ON "demand_signals"("tenantId");

-- CreateIndex
CREATE INDEX "demand_signals_productId_idx" ON "demand_signals"("productId");

-- CreateIndex
CREATE INDEX "demand_signals_productVariantId_idx" ON "demand_signals"("productVariantId");

-- CreateIndex
CREATE INDEX "demand_signals_brandId_idx" ON "demand_signals"("brandId");

-- CreateIndex
CREATE INDEX "demand_signals_sellerId_idx" ON "demand_signals"("sellerId");

-- CreateIndex
CREATE INDEX "demand_signals_sourceId_idx" ON "demand_signals"("sourceId");

-- CreateIndex
CREATE INDEX "demand_signals_signalType_idx" ON "demand_signals"("signalType");

-- CreateIndex
CREATE INDEX "demand_signals_metric_idx" ON "demand_signals"("metric");

-- CreateIndex
CREATE INDEX "demand_signals_observedAt_idx" ON "demand_signals"("observedAt");

-- CreateIndex
CREATE INDEX "demand_signals_periodStart_periodEnd_idx" ON "demand_signals"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "demand_signals_granularity_idx" ON "demand_signals"("granularity");

-- CreateIndex
CREATE INDEX "demand_signals_geography_idx" ON "demand_signals"("geography");

-- CreateIndex
CREATE INDEX "demand_signals_country_idx" ON "demand_signals"("country");

-- CreateIndex
CREATE INDEX "demand_signals_marketplace_idx" ON "demand_signals"("marketplace");

-- CreateIndex
CREATE INDEX "demand_signals_status_idx" ON "demand_signals"("status");

-- CreateIndex
CREATE INDEX "demand_signals_dataQuality_idx" ON "demand_signals"("dataQuality");

-- CreateIndex
CREATE INDEX "demand_signals_freshness_idx" ON "demand_signals"("freshness");

-- CreateIndex
CREATE INDEX "demand_signals_contentHash_idx" ON "demand_signals"("contentHash");

-- CreateIndex
CREATE INDEX "demand_signals_tenantId_productId_signalType_observedAt_idx" ON "demand_signals"("tenantId", "productId", "signalType", "observedAt");

-- CreateIndex
CREATE INDEX "demand_signals_tenantId_productId_metric_observedAt_idx" ON "demand_signals"("tenantId", "productId", "metric", "observedAt");

-- CreateIndex
CREATE INDEX "demand_signals_tenantId_productVariantId_signalType_observe_idx" ON "demand_signals"("tenantId", "productVariantId", "signalType", "observedAt");

-- CreateIndex
CREATE INDEX "demand_signals_tenantId_brandId_signalType_observedAt_idx" ON "demand_signals"("tenantId", "brandId", "signalType", "observedAt");

-- CreateIndex
CREATE INDEX "demand_signals_tenantId_geography_signalType_observedAt_idx" ON "demand_signals"("tenantId", "geography", "signalType", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "demand_signals_tenantId_sourceId_signalType_metric_observed_key" ON "demand_signals"("tenantId", "sourceId", "signalType", "metric", "observedAt", "granularity", "geography", "contentHash");

-- CreateIndex
CREATE INDEX "demand_calculations_tenantId_idx" ON "demand_calculations"("tenantId");

-- CreateIndex
CREATE INDEX "demand_calculations_calculationType_idx" ON "demand_calculations"("calculationType");

-- CreateIndex
CREATE INDEX "demand_calculations_entityType_entityId_idx" ON "demand_calculations"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "demand_calculations_productId_idx" ON "demand_calculations"("productId");

-- CreateIndex
CREATE INDEX "demand_calculations_productVariantId_idx" ON "demand_calculations"("productVariantId");

-- CreateIndex
CREATE INDEX "demand_calculations_brandId_idx" ON "demand_calculations"("brandId");

-- CreateIndex
CREATE INDEX "demand_calculations_geography_idx" ON "demand_calculations"("geography");

-- CreateIndex
CREATE INDEX "demand_calculations_country_idx" ON "demand_calculations"("country");

-- CreateIndex
CREATE INDEX "demand_calculations_status_idx" ON "demand_calculations"("status");

-- CreateIndex
CREATE INDEX "demand_calculations_calculatedAt_idx" ON "demand_calculations"("calculatedAt");

-- CreateIndex
CREATE INDEX "demand_calculations_algorithm_idx" ON "demand_calculations"("algorithm");

-- CreateIndex
CREATE INDEX "demand_calculations_confidence_idx" ON "demand_calculations"("confidence");

-- CreateIndex
CREATE INDEX "demand_calculations_dataSufficiency_idx" ON "demand_calculations"("dataSufficiency");

-- CreateIndex
CREATE INDEX "demand_calculations_freshness_idx" ON "demand_calculations"("freshness");

-- CreateIndex
CREATE INDEX "demand_calculations_windowDays_idx" ON "demand_calculations"("windowDays");

-- CreateIndex
CREATE INDEX "demand_calculations_tenantId_productId_calculationType_stat_idx" ON "demand_calculations"("tenantId", "productId", "calculationType", "status");

-- CreateIndex
CREATE INDEX "demand_calculations_tenantId_entityId_calculationType_calcu_idx" ON "demand_calculations"("tenantId", "entityId", "calculationType", "calculatedAt");

-- CreateIndex
CREATE INDEX "demand_calculations_tenantId_brandId_calculationType_status_idx" ON "demand_calculations"("tenantId", "brandId", "calculationType", "status");

-- CreateIndex
CREATE INDEX "demand_calculations_tenantId_geography_calculationType_stat_idx" ON "demand_calculations"("tenantId", "geography", "calculationType", "status");

-- AddForeignKey
ALTER TABLE "demand_signals" ADD CONSTRAINT "demand_signals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_signals" ADD CONSTRAINT "demand_signals_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_calculations" ADD CONSTRAINT "demand_calculations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
