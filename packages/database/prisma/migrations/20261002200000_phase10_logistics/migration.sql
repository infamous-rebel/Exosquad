-- CreateEnum
CREATE TYPE "LogisticsNodeType" AS ENUM ('ORIGIN', 'DESTINATION', 'PORT', 'AIRPORT', 'BORDER_CROSSING', 'WAREHOUSE', 'DISTRIBUTION_CENTER', 'TRANSLOAD_HUB', 'CONSOLIDATION_HUB', 'DECONSOLIDATION_HUB', 'FULFILLMENT_CENTER', 'MANUFACTURER_LOCATION', 'SUPPLIER_LOCATION', 'EXPORTER_LOCATION', 'IMPORTER_LOCATION', 'BANGLADESH_DISTRIBUTION_POINT', 'BANGLADESH_WAREHOUSE', 'BANGLADESH_MARKET', 'CUSTOMS_POINT', 'OTHER_LOGISTICS_NODE');

-- CreateEnum
CREATE TYPE "LogisticsLegType" AS ENUM ('ROAD', 'RAIL', 'SEA', 'AIR', 'INLAND_WATERWAY', 'MULTIMODAL', 'COURIER', 'PARCEL', 'TRUCK', 'CONTAINER', 'OTHER');

-- CreateEnum
CREATE TYPE "LogisticsRouteStatus" AS ENUM ('OBSERVED', 'CLAIMED', 'INFERRED', 'CORROBORATED', 'CONFIRMED', 'CONTRADICTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LogisticsAvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'UNKNOWN', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "LogisticsConflictResolutionState" AS ENUM ('OPEN', 'RESOLVED', 'SUPERSEDED', 'UNRESOLVED');

-- CreateTable
CREATE TABLE "logistics_nodes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nodeType" "LogisticsNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "canonicalEntityType" TEXT,
    "canonicalEntityId" TEXT,
    "sourceEntityId" TEXT,
    "sourceId" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "unLocode" TEXT,
    "iataCode" TEXT,
    "icaoCode" TEXT,
    "operationalStatus" "LogisticsAvailabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "customsCapability" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "identityStatus" TEXT NOT NULL DEFAULT 'unresolved',
    "identityConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_legs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "legType" "LogisticsLegType" NOT NULL,
    "carrierOrganizationId" TEXT,
    "carrierName" TEXT,
    "serviceType" TEXT,
    "legStatus" "LogisticsRouteStatus" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "evidenceStrength" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sourceDiversity" INTEGER NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "isContradicted" BOOLEAN NOT NULL DEFAULT false,
    "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    "transitTimeMinHours" INTEGER,
    "transitTimeMaxHours" INTEGER,
    "transitTimeKnown" BOOLEAN NOT NULL DEFAULT false,
    "frequencyPerWeek" DOUBLE PRECISION,
    "cutoffInfo" TEXT,
    "capacityInfo" TEXT,
    "restrictions" JSONB NOT NULL DEFAULT '[]',
    "contentHash" TEXT,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'LOGISTICS_ALGORITHM_V1',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_routes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "originNodeId" TEXT NOT NULL,
    "destinationNodeId" TEXT NOT NULL,
    "legIds" JSONB NOT NULL DEFAULT '[]',
    "routeStatus" "LogisticsRouteStatus" NOT NULL DEFAULT 'UNKNOWN',
    "totalTransitMinHours" INTEGER,
    "totalTransitMaxHours" INTEGER,
    "transitTimeKnown" BOOLEAN NOT NULL DEFAULT false,
    "legCount" INTEGER NOT NULL DEFAULT 0,
    "transshipmentCount" INTEGER NOT NULL DEFAULT 0,
    "modeChangeCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "evidenceCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "riskSummary" JSONB NOT NULL DEFAULT '{}',
    "contentHash" TEXT,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'LOGISTICS_ALGORITHM_V1',
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "unresolvedRequirements" JSONB NOT NULL DEFAULT '[]',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_observations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legId" TEXT,
    "routeId" TEXT,
    "nodeId" TEXT,
    "sourceId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "observationType" TEXT NOT NULL,
    "observationStatus" TEXT NOT NULL DEFAULT 'observed',
    "observedValue" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "parserVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_evidence_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "evidenceRole" TEXT NOT NULL,
    "evidenceStrength" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "effect" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sourceId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_conflicts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legId" TEXT,
    "nodeId" TEXT,
    "routeId" TEXT,
    "conflictType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supportingEvidenceId" TEXT NOT NULL,
    "contradictingEvidenceId" TEXT NOT NULL,
    "resolutionState" "LogisticsConflictResolutionState" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "resolutionEvidenceId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'LOGISTICS_ALGORITHM_V1',
    "inputHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "routeCount" INTEGER NOT NULL DEFAULT 0,
    "legCount" INTEGER NOT NULL DEFAULT 0,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "knownLegCount" INTEGER NOT NULL DEFAULT 0,
    "unknownLegCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedLegCount" INTEGER NOT NULL DEFAULT 0,
    "contradictedLegCount" INTEGER NOT NULL DEFAULT 0,
    "sourceDiversity" INTEGER NOT NULL DEFAULT 0,
    "evidenceCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "overallConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "nodeCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "legCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "evidenceCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "temporalCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "routeCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "riskCount" INTEGER NOT NULL DEFAULT 0,
    "anomalyCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_decisions" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "evidenceStrengthScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "independenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carrierConfidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "directnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "corroborationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freshnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contradictionPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalConfidence" DOUBLE PRECISION NOT NULL,
    "inputHash" TEXT NOT NULL,
    "legIds" JSONB NOT NULL DEFAULT '[]',
    "routeIds" JSONB NOT NULL DEFAULT '[]',
    "evidenceIds" JSONB NOT NULL DEFAULT '[]',
    "observationIds" JSONB NOT NULL DEFAULT '[]',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_risks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "riskType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "legId" TEXT,
    "nodeId" TEXT,
    "routeId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_anomalies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anomalyType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nodeId" TEXT,
    "legId" TEXT,
    "routeId" TEXT,
    "involvedNodeIds" JSONB NOT NULL DEFAULT '[]',
    "involvedLegIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assessmentId" TEXT NOT NULL,

    CONSTRAINT "logistics_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logistics_nodes_tenantId_idx" ON "logistics_nodes"("tenantId");

-- CreateIndex
CREATE INDEX "logistics_nodes_nodeType_idx" ON "logistics_nodes"("nodeType");

-- CreateIndex
CREATE INDEX "logistics_nodes_canonicalEntityType_canonicalEntityId_idx" ON "logistics_nodes"("canonicalEntityType", "canonicalEntityId");

-- CreateIndex
CREATE INDEX "logistics_nodes_normalizedName_idx" ON "logistics_nodes"("normalizedName");

-- CreateIndex
CREATE INDEX "logistics_nodes_identityStatus_idx" ON "logistics_nodes"("identityStatus");

-- CreateIndex
CREATE INDEX "logistics_nodes_country_idx" ON "logistics_nodes"("country");

-- CreateIndex
CREATE INDEX "logistics_nodes_operationalStatus_idx" ON "logistics_nodes"("operationalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_nodes_tenantId_nodeType_normalizedName_sourceId_key" ON "logistics_nodes"("tenantId", "nodeType", "normalizedName", "sourceId");

-- CreateIndex
CREATE INDEX "logistics_legs_tenantId_idx" ON "logistics_legs"("tenantId");

-- CreateIndex
CREATE INDEX "logistics_legs_fromNodeId_idx" ON "logistics_legs"("fromNodeId");

-- CreateIndex
CREATE INDEX "logistics_legs_toNodeId_idx" ON "logistics_legs"("toNodeId");

-- CreateIndex
CREATE INDEX "logistics_legs_legType_idx" ON "logistics_legs"("legType");

-- CreateIndex
CREATE INDEX "logistics_legs_legStatus_idx" ON "logistics_legs"("legStatus");

-- CreateIndex
CREATE INDEX "logistics_legs_contentHash_idx" ON "logistics_legs"("contentHash");

-- CreateIndex
CREATE INDEX "logistics_legs_confidence_idx" ON "logistics_legs"("confidence");

-- CreateIndex
CREATE INDEX "logistics_legs_isContradicted_idx" ON "logistics_legs"("isContradicted");

-- CreateIndex
CREATE INDEX "logistics_legs_validFrom_validTo_idx" ON "logistics_legs"("validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_legs_tenantId_fromNodeId_toNodeId_legType_content_key" ON "logistics_legs"("tenantId", "fromNodeId", "toNodeId", "legType", "contentHash");

-- CreateIndex
CREATE INDEX "logistics_routes_tenantId_idx" ON "logistics_routes"("tenantId");

-- CreateIndex
CREATE INDEX "logistics_routes_originNodeId_idx" ON "logistics_routes"("originNodeId");

-- CreateIndex
CREATE INDEX "logistics_routes_destinationNodeId_idx" ON "logistics_routes"("destinationNodeId");

-- CreateIndex
CREATE INDEX "logistics_routes_routeStatus_idx" ON "logistics_routes"("routeStatus");

-- CreateIndex
CREATE INDEX "logistics_routes_contentHash_idx" ON "logistics_routes"("contentHash");

-- CreateIndex
CREATE INDEX "logistics_routes_confidence_idx" ON "logistics_routes"("confidence");

-- CreateIndex
CREATE INDEX "logistics_routes_validFrom_validTo_idx" ON "logistics_routes"("validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_routes_tenantId_originNodeId_destinationNodeId_co_key" ON "logistics_routes"("tenantId", "originNodeId", "destinationNodeId", "contentHash");

-- CreateIndex
CREATE INDEX "logistics_observations_tenantId_idx" ON "logistics_observations"("tenantId");

-- CreateIndex
CREATE INDEX "logistics_observations_legId_idx" ON "logistics_observations"("legId");

-- CreateIndex
CREATE INDEX "logistics_observations_routeId_idx" ON "logistics_observations"("routeId");

-- CreateIndex
CREATE INDEX "logistics_observations_nodeId_idx" ON "logistics_observations"("nodeId");

-- CreateIndex
CREATE INDEX "logistics_observations_sourceId_idx" ON "logistics_observations"("sourceId");

-- CreateIndex
CREATE INDEX "logistics_observations_evidenceId_idx" ON "logistics_observations"("evidenceId");

-- CreateIndex
CREATE INDEX "logistics_observations_contentHash_idx" ON "logistics_observations"("contentHash");

-- CreateIndex
CREATE INDEX "logistics_observations_observedAt_idx" ON "logistics_observations"("observedAt");

-- CreateIndex
CREATE INDEX "logistics_observations_observationType_idx" ON "logistics_observations"("observationType");

-- CreateIndex
CREATE INDEX "logistics_observations_observationStatus_idx" ON "logistics_observations"("observationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_observations_tenantId_legId_sourceId_contentHash_key" ON "logistics_observations"("tenantId", "legId", "sourceId", "contentHash");

-- CreateIndex
CREATE INDEX "logistics_evidence_links_tenantId_idx" ON "logistics_evidence_links"("tenantId");

-- CreateIndex
CREATE INDEX "logistics_evidence_links_legId_idx" ON "logistics_evidence_links"("legId");

-- CreateIndex
CREATE INDEX "logistics_evidence_links_evidenceId_idx" ON "logistics_evidence_links"("evidenceId");

-- CreateIndex
CREATE INDEX "logistics_evidence_links_evidenceRole_idx" ON "logistics_evidence_links"("evidenceRole");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_evidence_links_legId_evidenceId_key" ON "logistics_evidence_links"("legId", "evidenceId");

-- CreateIndex
CREATE INDEX "logistics_conflicts_tenantId_idx" ON "logistics_conflicts"("tenantId");

-- CreateIndex
CREATE INDEX "logistics_conflicts_legId_idx" ON "logistics_conflicts"("legId");

-- CreateIndex
CREATE INDEX "logistics_conflicts_nodeId_idx" ON "logistics_conflicts"("nodeId");

-- CreateIndex
CREATE INDEX "logistics_conflicts_routeId_idx" ON "logistics_conflicts"("routeId");

-- CreateIndex
CREATE INDEX "logistics_conflicts_conflictType_idx" ON "logistics_conflicts"("conflictType");

-- CreateIndex
CREATE INDEX "logistics_conflicts_severity_idx" ON "logistics_conflicts"("severity");

-- CreateIndex
CREATE INDEX "logistics_conflicts_resolutionState_idx" ON "logistics_conflicts"("resolutionState");

-- CreateIndex
CREATE INDEX "logistics_conflicts_detectedAt_idx" ON "logistics_conflicts"("detectedAt");

-- CreateIndex
CREATE INDEX "logistics_assessments_tenantId_idx" ON "logistics_assessments"("tenantId");

-- CreateIndex
CREATE INDEX "logistics_assessments_tenantId_status_idx" ON "logistics_assessments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "logistics_assessments_tenantId_subjectType_subjectId_idx" ON "logistics_assessments"("tenantId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "logistics_assessments_tenantId_overallConfidence_idx" ON "logistics_assessments"("tenantId", "overallConfidence");

-- CreateIndex
CREATE INDEX "logistics_assessments_tenantId_algorithmVersion_idx" ON "logistics_assessments"("tenantId", "algorithmVersion");

-- CreateIndex
CREATE INDEX "logistics_assessments_inputHash_idx" ON "logistics_assessments"("inputHash");

-- CreateIndex
CREATE INDEX "logistics_assessments_calculatedAt_idx" ON "logistics_assessments"("calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_assessments_tenantId_subjectType_subjectId_versio_key" ON "logistics_assessments"("tenantId", "subjectType", "subjectId", "version");

-- CreateIndex
CREATE INDEX "logistics_decisions_assessmentId_idx" ON "logistics_decisions"("assessmentId");

-- CreateIndex
CREATE INDEX "logistics_decisions_calculatedAt_idx" ON "logistics_decisions"("calculatedAt");

-- CreateIndex
CREATE INDEX "logistics_decisions_algorithmVersion_idx" ON "logistics_decisions"("algorithmVersion");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_decisions_assessmentId_inputHash_key" ON "logistics_decisions"("assessmentId", "inputHash");

-- CreateIndex
CREATE INDEX "logistics_risks_tenantId_idx" ON "logistics_risks"("tenantId");

-- CreateIndex
CREATE INDEX "logistics_risks_assessmentId_idx" ON "logistics_risks"("assessmentId");

-- CreateIndex
CREATE INDEX "logistics_risks_riskType_idx" ON "logistics_risks"("riskType");

-- CreateIndex
CREATE INDEX "logistics_risks_severity_idx" ON "logistics_risks"("severity");

-- CreateIndex
CREATE INDEX "logistics_risks_detectedAt_idx" ON "logistics_risks"("detectedAt");

-- CreateIndex
CREATE INDEX "logistics_anomalies_tenantId_idx" ON "logistics_anomalies"("tenantId");

-- CreateIndex
CREATE INDEX "logistics_anomalies_anomalyType_idx" ON "logistics_anomalies"("anomalyType");

-- CreateIndex
CREATE INDEX "logistics_anomalies_severity_idx" ON "logistics_anomalies"("severity");

-- CreateIndex
CREATE INDEX "logistics_anomalies_status_idx" ON "logistics_anomalies"("status");

-- CreateIndex
CREATE INDEX "logistics_anomalies_detectedAt_idx" ON "logistics_anomalies"("detectedAt");

-- AddForeignKey
ALTER TABLE "logistics_nodes" ADD CONSTRAINT "logistics_nodes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_legs" ADD CONSTRAINT "logistics_legs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_legs" ADD CONSTRAINT "logistics_legs_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "logistics_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_legs" ADD CONSTRAINT "logistics_legs_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "logistics_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_routes" ADD CONSTRAINT "logistics_routes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_observations" ADD CONSTRAINT "logistics_observations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_observations" ADD CONSTRAINT "logistics_observations_legId_fkey" FOREIGN KEY ("legId") REFERENCES "logistics_legs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_observations" ADD CONSTRAINT "logistics_observations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_observations" ADD CONSTRAINT "logistics_observations_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_evidence_links" ADD CONSTRAINT "logistics_evidence_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_evidence_links" ADD CONSTRAINT "logistics_evidence_links_legId_fkey" FOREIGN KEY ("legId") REFERENCES "logistics_legs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_evidence_links" ADD CONSTRAINT "logistics_evidence_links_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_conflicts" ADD CONSTRAINT "logistics_conflicts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_conflicts" ADD CONSTRAINT "logistics_conflicts_legId_fkey" FOREIGN KEY ("legId") REFERENCES "logistics_legs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_conflicts" ADD CONSTRAINT "logistics_conflicts_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "logistics_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_assessments" ADD CONSTRAINT "logistics_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_decisions" ADD CONSTRAINT "logistics_decisions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "logistics_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_risks" ADD CONSTRAINT "logistics_risks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_risks" ADD CONSTRAINT "logistics_risks_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "logistics_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_anomalies" ADD CONSTRAINT "logistics_anomalies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_anomalies" ADD CONSTRAINT "logistics_anomalies_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "logistics_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

