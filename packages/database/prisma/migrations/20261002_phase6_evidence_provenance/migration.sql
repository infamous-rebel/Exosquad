-- DropIndex
DROP INDEX "evidence_claimType_idx";

-- AlterTable
ALTER TABLE "evidence" DROP COLUMN "claimType",
DROP COLUMN "claimValue",
ADD COLUMN     "commercialRelationshipId" TEXT,
ADD COLUMN     "confidenceBasis" JSONB,
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "evidenceType" TEXT NOT NULL,
ADD COLUMN     "extractedValue" JSONB,
ADD COLUMN     "extractionMethod" TEXT,
ADD COLUMN     "extractionTimestamp" TIMESTAMP(3),
ADD COLUMN     "fieldMappingVersion" TEXT,
ADD COLUMN     "freshness" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "identityDecisionId" TEXT,
ADD COLUMN     "normalizationVersion" TEXT,
ADD COLUMN     "normalizedValue" JSONB,
ADD COLUMN     "observationStatus" TEXT NOT NULL DEFAULT 'observed',
ADD COLUMN     "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "orgIdentityDecisionId" TEXT,
ADD COLUMN     "parserVersion" TEXT,
ADD COLUMN     "productSellerId" TEXT,
ADD COLUMN     "productSupplierId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "rawResponseId" TEXT,
ADD COLUMN     "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sourceField" TEXT,
ADD COLUMN     "sourcePath" TEXT,
ADD COLUMN     "sourceRecordId" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3),
ADD COLUMN     "valueType" TEXT NOT NULL DEFAULT 'string',
ALTER COLUMN "method" SET DEFAULT 'automated';

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "predicate" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "value" JSONB,
    "claimType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "observationStatus" TEXT NOT NULL DEFAULT 'observed',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_conflicts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "conflictType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "resolverMethod" TEXT,
    "supportingEvidenceId" TEXT NOT NULL,
    "contradictingEvidenceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "calculationType" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "inputs" JSONB NOT NULL DEFAULT '[]',
    "outputs" JSONB NOT NULL,
    "units" TEXT,
    "currency" TEXT,
    "calculationTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceId" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provenance_edges" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "sourceNodeType" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "targetNodeType" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "observationStatus" TEXT NOT NULL DEFAULT 'observed',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "sourceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provenance_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClaimEvidence" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_CalculationInputEvidence" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_CalculationOutputEvidence" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "claims_tenantId_idx" ON "claims"("tenantId");

-- CreateIndex
CREATE INDEX "claims_subjectType_subjectId_idx" ON "claims"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "claims_predicate_idx" ON "claims"("predicate");

-- CreateIndex
CREATE INDEX "claims_claimType_idx" ON "claims"("claimType");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- CreateIndex
CREATE INDEX "claims_observationStatus_idx" ON "claims"("observationStatus");

-- CreateIndex
CREATE INDEX "claims_observedAt_idx" ON "claims"("observedAt");

-- CreateIndex
CREATE INDEX "evidence_conflicts_tenantId_idx" ON "evidence_conflicts"("tenantId");

-- CreateIndex
CREATE INDEX "evidence_conflicts_entityType_entityId_idx" ON "evidence_conflicts"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "evidence_conflicts_conflictType_idx" ON "evidence_conflicts"("conflictType");

-- CreateIndex
CREATE INDEX "evidence_conflicts_status_idx" ON "evidence_conflicts"("status");

-- CreateIndex
CREATE INDEX "evidence_conflicts_supportingEvidenceId_idx" ON "evidence_conflicts"("supportingEvidenceId");

-- CreateIndex
CREATE INDEX "evidence_conflicts_contradictingEvidenceId_idx" ON "evidence_conflicts"("contradictingEvidenceId");

-- CreateIndex
CREATE INDEX "calculations_tenantId_idx" ON "calculations"("tenantId");

-- CreateIndex
CREATE INDEX "calculations_calculationType_idx" ON "calculations"("calculationType");

-- CreateIndex
CREATE INDEX "calculations_entityType_entityId_idx" ON "calculations"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "calculations_status_idx" ON "calculations"("status");

-- CreateIndex
CREATE INDEX "calculations_calculationTimestamp_idx" ON "calculations"("calculationTimestamp");

-- CreateIndex
CREATE INDEX "calculations_algorithm_idx" ON "calculations"("algorithm");

-- CreateIndex
CREATE INDEX "provenance_edges_tenantId_idx" ON "provenance_edges"("tenantId");

-- CreateIndex
CREATE INDEX "provenance_edges_sourceNodeId_idx" ON "provenance_edges"("sourceNodeId");

-- CreateIndex
CREATE INDEX "provenance_edges_targetNodeId_idx" ON "provenance_edges"("targetNodeId");

-- CreateIndex
CREATE INDEX "provenance_edges_sourceNodeType_idx" ON "provenance_edges"("sourceNodeType");

-- CreateIndex
CREATE INDEX "provenance_edges_targetNodeType_idx" ON "provenance_edges"("targetNodeType");

-- CreateIndex
CREATE INDEX "provenance_edges_relationshipType_idx" ON "provenance_edges"("relationshipType");

-- CreateIndex
CREATE INDEX "provenance_edges_observationStatus_idx" ON "provenance_edges"("observationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "provenance_edges_tenantId_sourceNodeId_targetNodeId_relatio_key" ON "provenance_edges"("tenantId", "sourceNodeId", "targetNodeId", "relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "_ClaimEvidence_AB_unique" ON "_ClaimEvidence"("A", "B");

-- CreateIndex
CREATE INDEX "_ClaimEvidence_B_index" ON "_ClaimEvidence"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CalculationInputEvidence_AB_unique" ON "_CalculationInputEvidence"("A", "B");

-- CreateIndex
CREATE INDEX "_CalculationInputEvidence_B_index" ON "_CalculationInputEvidence"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CalculationOutputEvidence_AB_unique" ON "_CalculationOutputEvidence"("A", "B");

-- CreateIndex
CREATE INDEX "_CalculationOutputEvidence_B_index" ON "_CalculationOutputEvidence"("B");

-- CreateIndex
CREATE INDEX "evidence_sourceId_idx" ON "evidence"("sourceId");

-- CreateIndex
CREATE INDEX "evidence_rawResponseId_idx" ON "evidence"("rawResponseId");

-- CreateIndex
CREATE INDEX "evidence_evidenceType_idx" ON "evidence"("evidenceType");

-- CreateIndex
CREATE INDEX "evidence_status_idx" ON "evidence"("status");

-- CreateIndex
CREATE INDEX "evidence_freshness_idx" ON "evidence"("freshness");

-- CreateIndex
CREATE INDEX "evidence_confidence_idx" ON "evidence"("confidence");

-- CreateIndex
CREATE INDEX "evidence_contentHash_idx" ON "evidence"("contentHash");

-- CreateIndex
CREATE INDEX "evidence_sourceRecordId_idx" ON "evidence"("sourceRecordId");

-- CreateIndex
CREATE INDEX "evidence_observedAt_idx" ON "evidence"("observedAt");

-- CreateIndex
CREATE INDEX "evidence_validFrom_validUntil_idx" ON "evidence"("validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "evidence_identityDecisionId_idx" ON "evidence"("identityDecisionId");

-- CreateIndex
CREATE INDEX "evidence_orgIdentityDecisionId_idx" ON "evidence"("orgIdentityDecisionId");

-- CreateIndex
CREATE INDEX "evidence_commercialRelationshipId_idx" ON "evidence"("commercialRelationshipId");

-- CreateIndex
CREATE INDEX "evidence_productSellerId_idx" ON "evidence"("productSellerId");

-- CreateIndex
CREATE INDEX "evidence_productSupplierId_idx" ON "evidence"("productSupplierId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_tenantId_sourceId_observationId_sourcePath_evidenc_key" ON "evidence"("tenantId", "sourceId", "observationId", "sourcePath", "evidenceType", "contentHash");

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_rawResponseId_fkey" FOREIGN KEY ("rawResponseId") REFERENCES "raw_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_identityDecisionId_fkey" FOREIGN KEY ("identityDecisionId") REFERENCES "identity_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_orgIdentityDecisionId_fkey" FOREIGN KEY ("orgIdentityDecisionId") REFERENCES "org_identity_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_commercialRelationshipId_fkey" FOREIGN KEY ("commercialRelationshipId") REFERENCES "commercial_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_productSellerId_fkey" FOREIGN KEY ("productSellerId") REFERENCES "product_sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_productSupplierId_fkey" FOREIGN KEY ("productSupplierId") REFERENCES "product_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_conflicts" ADD CONSTRAINT "evidence_conflicts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_conflicts" ADD CONSTRAINT "evidence_conflicts_supportingEvidenceId_fkey" FOREIGN KEY ("supportingEvidenceId") REFERENCES "evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_conflicts" ADD CONSTRAINT "evidence_conflicts_contradictingEvidenceId_fkey" FOREIGN KEY ("contradictingEvidenceId") REFERENCES "evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provenance_edges" ADD CONSTRAINT "provenance_edges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClaimEvidence" ADD CONSTRAINT "_ClaimEvidence_A_fkey" FOREIGN KEY ("A") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClaimEvidence" ADD CONSTRAINT "_ClaimEvidence_B_fkey" FOREIGN KEY ("B") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CalculationInputEvidence" ADD CONSTRAINT "_CalculationInputEvidence_A_fkey" FOREIGN KEY ("A") REFERENCES "calculations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CalculationInputEvidence" ADD CONSTRAINT "_CalculationInputEvidence_B_fkey" FOREIGN KEY ("B") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CalculationOutputEvidence" ADD CONSTRAINT "_CalculationOutputEvidence_A_fkey" FOREIGN KEY ("A") REFERENCES "calculations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CalculationOutputEvidence" ADD CONSTRAINT "_CalculationOutputEvidence_B_fkey" FOREIGN KEY ("B") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

