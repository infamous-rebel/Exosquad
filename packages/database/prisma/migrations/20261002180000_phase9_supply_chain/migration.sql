-- CreateTable
CREATE TABLE "supply_chain_nodes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "canonicalEntityType" TEXT,
    "canonicalEntityId" TEXT,
    "sourceEntityId" TEXT,
    "sourceId" TEXT,
    "country" TEXT,
    "identityStatus" TEXT NOT NULL DEFAULT 'unresolved',
    "identityConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_chain_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_chain_edges" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "edgeType" TEXT NOT NULL,
    "relationshipStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "evidenceStrength" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sourceDiversity" INTEGER NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "isContradicted" BOOLEAN NOT NULL DEFAULT false,
    "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT,
    "directness" TEXT NOT NULL DEFAULT 'direct',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'SUPPLY_CHAIN_ALGORITHM_V1',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_chain_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_chain_observations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "observationStatus" TEXT NOT NULL DEFAULT 'observed',
    "observedValue" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "parserVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_chain_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_chain_evidence_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "evidenceRole" TEXT NOT NULL,
    "evidenceStrength" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "effect" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sourceId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_chain_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_chain_conflicts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "edgeId" TEXT,
    "nodeId" TEXT,
    "conflictType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supportingEvidenceId" TEXT NOT NULL,
    "contradictingEvidenceId" TEXT NOT NULL,
    "resolutionState" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "resolutionEvidenceId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_chain_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_chain_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'SUPPLY_CHAIN_ALGORITHM_V1',
    "inputHash" TEXT NOT NULL,
    "graphCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "knownNodeCount" INTEGER NOT NULL DEFAULT 0,
    "unknownNodeCount" INTEGER NOT NULL DEFAULT 0,
    "knownEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "unknownEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "corroboratedEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "claimedEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "observedEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "inferredEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "contradictedEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "sourceDiversity" INTEGER NOT NULL DEFAULT 0,
    "evidenceCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "identityConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "temporalCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "pathCount" INTEGER NOT NULL DEFAULT 0,
    "alternatePathCount" INTEGER NOT NULL DEFAULT 0,
    "criticalUnknownCount" INTEGER NOT NULL DEFAULT 0,
    "overallConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "nodeCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "edgeCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "evidenceCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "identityCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "temporalCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_chain_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_chain_decisions" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "evidenceStrengthScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "independenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "identityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "directnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "corroborationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freshnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contradictionPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalConfidence" DOUBLE PRECISION NOT NULL,
    "inputHash" TEXT NOT NULL,
    "edgeIds" JSONB NOT NULL DEFAULT '[]',
    "evidenceIds" JSONB NOT NULL DEFAULT '[]',
    "observationIds" JSONB NOT NULL DEFAULT '[]',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_chain_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_chain_verifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "verificationType" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "targetNodeType" TEXT,
    "targetNodeId" TEXT,
    "targetEdgeType" TEXT,
    "targetEdgeId" TEXT,
    "existingEvidence" JSONB NOT NULL DEFAULT '[]',
    "missingEvidence" JSONB NOT NULL DEFAULT '[]',
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_chain_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_chain_claims" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "claimingNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_chain_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_chain_anomalies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anomalyType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nodeId" TEXT,
    "edgeId" TEXT,
    "involvedNodeIds" JSONB NOT NULL DEFAULT '[]',
    "involvedEdgeIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_chain_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supply_chain_nodes_tenantId_idx" ON "supply_chain_nodes"("tenantId");

-- CreateIndex
CREATE INDEX "supply_chain_nodes_nodeType_idx" ON "supply_chain_nodes"("nodeType");

-- CreateIndex
CREATE INDEX "supply_chain_nodes_canonicalEntityType_canonicalEntityId_idx" ON "supply_chain_nodes"("canonicalEntityType", "canonicalEntityId");

-- CreateIndex
CREATE INDEX "supply_chain_nodes_normalizedName_idx" ON "supply_chain_nodes"("normalizedName");

-- CreateIndex
CREATE INDEX "supply_chain_nodes_identityStatus_idx" ON "supply_chain_nodes"("identityStatus");

-- CreateIndex
CREATE INDEX "supply_chain_nodes_country_idx" ON "supply_chain_nodes"("country");

-- CreateIndex
CREATE UNIQUE INDEX "supply_chain_nodes_tenantId_nodeType_normalizedName_sourceI_key" ON "supply_chain_nodes"("tenantId", "nodeType", "normalizedName", "sourceId");

-- CreateIndex
CREATE INDEX "supply_chain_edges_tenantId_idx" ON "supply_chain_edges"("tenantId");

-- CreateIndex
CREATE INDEX "supply_chain_edges_fromNodeId_idx" ON "supply_chain_edges"("fromNodeId");

-- CreateIndex
CREATE INDEX "supply_chain_edges_toNodeId_idx" ON "supply_chain_edges"("toNodeId");

-- CreateIndex
CREATE INDEX "supply_chain_edges_edgeType_idx" ON "supply_chain_edges"("edgeType");

-- CreateIndex
CREATE INDEX "supply_chain_edges_relationshipStatus_idx" ON "supply_chain_edges"("relationshipStatus");

-- CreateIndex
CREATE INDEX "supply_chain_edges_contentHash_idx" ON "supply_chain_edges"("contentHash");

-- CreateIndex
CREATE INDEX "supply_chain_edges_confidence_idx" ON "supply_chain_edges"("confidence");

-- CreateIndex
CREATE INDEX "supply_chain_edges_isContradicted_idx" ON "supply_chain_edges"("isContradicted");

-- CreateIndex
CREATE INDEX "supply_chain_edges_validFrom_validTo_idx" ON "supply_chain_edges"("validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "supply_chain_edges_tenantId_fromNodeId_toNodeId_edgeType_co_key" ON "supply_chain_edges"("tenantId", "fromNodeId", "toNodeId", "edgeType", "contentHash");

-- CreateIndex
CREATE INDEX "supply_chain_observations_tenantId_idx" ON "supply_chain_observations"("tenantId");

-- CreateIndex
CREATE INDEX "supply_chain_observations_edgeId_idx" ON "supply_chain_observations"("edgeId");

-- CreateIndex
CREATE INDEX "supply_chain_observations_sourceId_idx" ON "supply_chain_observations"("sourceId");

-- CreateIndex
CREATE INDEX "supply_chain_observations_evidenceId_idx" ON "supply_chain_observations"("evidenceId");

-- CreateIndex
CREATE INDEX "supply_chain_observations_contentHash_idx" ON "supply_chain_observations"("contentHash");

-- CreateIndex
CREATE INDEX "supply_chain_observations_observedAt_idx" ON "supply_chain_observations"("observedAt");

-- CreateIndex
CREATE INDEX "supply_chain_observations_observationStatus_idx" ON "supply_chain_observations"("observationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "supply_chain_observations_tenantId_edgeId_sourceId_contentH_key" ON "supply_chain_observations"("tenantId", "edgeId", "sourceId", "contentHash");

-- CreateIndex
CREATE INDEX "supply_chain_evidence_links_tenantId_idx" ON "supply_chain_evidence_links"("tenantId");

-- CreateIndex
CREATE INDEX "supply_chain_evidence_links_edgeId_idx" ON "supply_chain_evidence_links"("edgeId");

-- CreateIndex
CREATE INDEX "supply_chain_evidence_links_evidenceId_idx" ON "supply_chain_evidence_links"("evidenceId");

-- CreateIndex
CREATE INDEX "supply_chain_evidence_links_evidenceRole_idx" ON "supply_chain_evidence_links"("evidenceRole");

-- CreateIndex
CREATE UNIQUE INDEX "supply_chain_evidence_links_edgeId_evidenceId_key" ON "supply_chain_evidence_links"("edgeId", "evidenceId");

-- CreateIndex
CREATE INDEX "supply_chain_conflicts_tenantId_idx" ON "supply_chain_conflicts"("tenantId");

-- CreateIndex
CREATE INDEX "supply_chain_conflicts_edgeId_idx" ON "supply_chain_conflicts"("edgeId");

-- CreateIndex
CREATE INDEX "supply_chain_conflicts_nodeId_idx" ON "supply_chain_conflicts"("nodeId");

-- CreateIndex
CREATE INDEX "supply_chain_conflicts_conflictType_idx" ON "supply_chain_conflicts"("conflictType");

-- CreateIndex
CREATE INDEX "supply_chain_conflicts_severity_idx" ON "supply_chain_conflicts"("severity");

-- CreateIndex
CREATE INDEX "supply_chain_conflicts_resolutionState_idx" ON "supply_chain_conflicts"("resolutionState");

-- CreateIndex
CREATE INDEX "supply_chain_conflicts_detectedAt_idx" ON "supply_chain_conflicts"("detectedAt");

-- CreateIndex
CREATE INDEX "supply_chain_assessments_tenantId_idx" ON "supply_chain_assessments"("tenantId");

-- CreateIndex
CREATE INDEX "supply_chain_assessments_tenantId_status_idx" ON "supply_chain_assessments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "supply_chain_assessments_tenantId_subjectType_subjectId_idx" ON "supply_chain_assessments"("tenantId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "supply_chain_assessments_tenantId_overallConfidence_idx" ON "supply_chain_assessments"("tenantId", "overallConfidence");

-- CreateIndex
CREATE INDEX "supply_chain_assessments_tenantId_algorithmVersion_idx" ON "supply_chain_assessments"("tenantId", "algorithmVersion");

-- CreateIndex
CREATE INDEX "supply_chain_assessments_inputHash_idx" ON "supply_chain_assessments"("inputHash");

-- CreateIndex
CREATE INDEX "supply_chain_assessments_calculatedAt_idx" ON "supply_chain_assessments"("calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "supply_chain_assessments_tenantId_subjectType_subjectId_inp_key" ON "supply_chain_assessments"("tenantId", "subjectType", "subjectId", "inputHash");

-- CreateIndex
CREATE INDEX "supply_chain_decisions_assessmentId_idx" ON "supply_chain_decisions"("assessmentId");

-- CreateIndex
CREATE INDEX "supply_chain_decisions_calculatedAt_idx" ON "supply_chain_decisions"("calculatedAt");

-- CreateIndex
CREATE INDEX "supply_chain_decisions_algorithmVersion_idx" ON "supply_chain_decisions"("algorithmVersion");

-- CreateIndex
CREATE UNIQUE INDEX "supply_chain_decisions_assessmentId_inputHash_key" ON "supply_chain_decisions"("assessmentId", "inputHash");

-- CreateIndex
CREATE INDEX "supply_chain_verifications_tenantId_idx" ON "supply_chain_verifications"("tenantId");

-- CreateIndex
CREATE INDEX "supply_chain_verifications_assessmentId_idx" ON "supply_chain_verifications"("assessmentId");

-- CreateIndex
CREATE INDEX "supply_chain_verifications_verificationType_idx" ON "supply_chain_verifications"("verificationType");

-- CreateIndex
CREATE INDEX "supply_chain_verifications_priority_idx" ON "supply_chain_verifications"("priority");

-- CreateIndex
CREATE INDEX "supply_chain_claims_tenantId_idx" ON "supply_chain_claims"("tenantId");

-- CreateIndex
CREATE INDEX "supply_chain_claims_claimingNodeId_idx" ON "supply_chain_claims"("claimingNodeId");

-- CreateIndex
CREATE INDEX "supply_chain_claims_targetNodeId_idx" ON "supply_chain_claims"("targetNodeId");

-- CreateIndex
CREATE INDEX "supply_chain_claims_claimType_idx" ON "supply_chain_claims"("claimType");

-- CreateIndex
CREATE INDEX "supply_chain_claims_status_idx" ON "supply_chain_claims"("status");

-- CreateIndex
CREATE INDEX "supply_chain_claims_observedAt_idx" ON "supply_chain_claims"("observedAt");

-- CreateIndex
CREATE INDEX "supply_chain_anomalies_tenantId_idx" ON "supply_chain_anomalies"("tenantId");

-- CreateIndex
CREATE INDEX "supply_chain_anomalies_anomalyType_idx" ON "supply_chain_anomalies"("anomalyType");

-- CreateIndex
CREATE INDEX "supply_chain_anomalies_severity_idx" ON "supply_chain_anomalies"("severity");

-- CreateIndex
CREATE INDEX "supply_chain_anomalies_status_idx" ON "supply_chain_anomalies"("status");

-- CreateIndex
CREATE INDEX "supply_chain_anomalies_detectedAt_idx" ON "supply_chain_anomalies"("detectedAt");

-- AddForeignKey
ALTER TABLE "supply_chain_nodes" ADD CONSTRAINT "supply_chain_nodes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_edges" ADD CONSTRAINT "supply_chain_edges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_edges" ADD CONSTRAINT "supply_chain_edges_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "supply_chain_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_edges" ADD CONSTRAINT "supply_chain_edges_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "supply_chain_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_observations" ADD CONSTRAINT "supply_chain_observations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_observations" ADD CONSTRAINT "supply_chain_observations_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "supply_chain_edges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_observations" ADD CONSTRAINT "supply_chain_observations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_observations" ADD CONSTRAINT "supply_chain_observations_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_evidence_links" ADD CONSTRAINT "supply_chain_evidence_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_evidence_links" ADD CONSTRAINT "supply_chain_evidence_links_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "supply_chain_edges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_evidence_links" ADD CONSTRAINT "supply_chain_evidence_links_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_conflicts" ADD CONSTRAINT "supply_chain_conflicts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_conflicts" ADD CONSTRAINT "supply_chain_conflicts_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "supply_chain_edges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_conflicts" ADD CONSTRAINT "supply_chain_conflicts_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "supply_chain_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_assessments" ADD CONSTRAINT "supply_chain_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_decisions" ADD CONSTRAINT "supply_chain_decisions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "supply_chain_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_verifications" ADD CONSTRAINT "supply_chain_verifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_verifications" ADD CONSTRAINT "supply_chain_verifications_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "supply_chain_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_claims" ADD CONSTRAINT "supply_chain_claims_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_claims" ADD CONSTRAINT "supply_chain_claims_claimingNodeId_fkey" FOREIGN KEY ("claimingNodeId") REFERENCES "supply_chain_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_claims" ADD CONSTRAINT "supply_chain_claims_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "supply_chain_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_chain_anomalies" ADD CONSTRAINT "supply_chain_anomalies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

