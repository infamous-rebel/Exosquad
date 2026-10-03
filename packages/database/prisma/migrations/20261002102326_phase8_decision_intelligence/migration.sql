-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DETECTED', 'VALIDATED', 'WATCH', 'ACTIONABLE', 'DISMISSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT,
    "productVariantId" TEXT,
    "geographyCode" TEXT,
    "categoryId" TEXT,
    "opportunityType" TEXT NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'DETECTED',
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "algorithmVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "demandScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "growthScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "velocityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "persistenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accelerationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seasonalityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceDiversityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_calculations" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "demandScore" DOUBLE PRECISION NOT NULL,
    "growthScore" DOUBLE PRECISION NOT NULL,
    "velocityScore" DOUBLE PRECISION NOT NULL,
    "persistenceScore" DOUBLE PRECISION NOT NULL,
    "accelerationScore" DOUBLE PRECISION NOT NULL,
    "seasonalityScore" DOUBLE PRECISION NOT NULL,
    "sourceDiversityScore" DOUBLE PRECISION NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "competitionScore" DOUBLE PRECISION,
    "commercialScore" DOUBLE PRECISION,
    "sourcingScore" DOUBLE PRECISION,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputSignalIds" JSONB NOT NULL DEFAULT '[]',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_evidence" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "demandSignalId" TEXT,
    "weight" DOUBLE PRECISION NOT NULL,
    "contribution" DOUBLE PRECISION NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_risks" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "riskType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_actions" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunities_tenantId_idx" ON "opportunities"("tenantId");

-- CreateIndex
CREATE INDEX "opportunities_tenantId_status_idx" ON "opportunities"("tenantId", "status");

-- CreateIndex
CREATE INDEX "opportunities_tenantId_productId_idx" ON "opportunities"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "opportunities_tenantId_productVariantId_idx" ON "opportunities"("tenantId", "productVariantId");

-- CreateIndex
CREATE INDEX "opportunities_tenantId_opportunityType_idx" ON "opportunities"("tenantId", "opportunityType");

-- CreateIndex
CREATE INDEX "opportunities_tenantId_geographyCode_idx" ON "opportunities"("tenantId", "geographyCode");

-- CreateIndex
CREATE INDEX "opportunities_tenantId_detectedAt_idx" ON "opportunities"("tenantId", "detectedAt");

-- CreateIndex
CREATE INDEX "opportunities_tenantId_score_idx" ON "opportunities"("tenantId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_tenantId_contentHash_key" ON "opportunities"("tenantId", "contentHash");

-- CreateIndex
CREATE INDEX "opportunity_calculations_opportunityId_idx" ON "opportunity_calculations"("opportunityId");

-- CreateIndex
CREATE INDEX "opportunity_calculations_calculatedAt_idx" ON "opportunity_calculations"("calculatedAt");

-- CreateIndex
CREATE INDEX "opportunity_calculations_algorithmVersion_idx" ON "opportunity_calculations"("algorithmVersion");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_calculations_opportunityId_inputHash_key" ON "opportunity_calculations"("opportunityId", "inputHash");

-- CreateIndex
CREATE INDEX "opportunity_evidence_opportunityId_idx" ON "opportunity_evidence"("opportunityId");

-- CreateIndex
CREATE INDEX "opportunity_evidence_demandSignalId_idx" ON "opportunity_evidence"("demandSignalId");

-- CreateIndex
CREATE INDEX "opportunity_evidence_sourceId_idx" ON "opportunity_evidence"("sourceId");

-- CreateIndex
CREATE INDEX "opportunity_evidence_evidenceType_idx" ON "opportunity_evidence"("evidenceType");

-- CreateIndex
CREATE INDEX "opportunity_risks_opportunityId_idx" ON "opportunity_risks"("opportunityId");

-- CreateIndex
CREATE INDEX "opportunity_risks_riskType_idx" ON "opportunity_risks"("riskType");

-- CreateIndex
CREATE INDEX "opportunity_risks_severity_idx" ON "opportunity_risks"("severity");

-- CreateIndex
CREATE INDEX "opportunity_actions_opportunityId_idx" ON "opportunity_actions"("opportunityId");

-- CreateIndex
CREATE INDEX "opportunity_actions_actionType_idx" ON "opportunity_actions"("actionType");

-- CreateIndex
CREATE INDEX "opportunity_actions_priority_idx" ON "opportunity_actions"("priority");

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_calculations" ADD CONSTRAINT "opportunity_calculations_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_evidence" ADD CONSTRAINT "opportunity_evidence_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_risks" ADD CONSTRAINT "opportunity_risks_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_actions" ADD CONSTRAINT "opportunity_actions_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
