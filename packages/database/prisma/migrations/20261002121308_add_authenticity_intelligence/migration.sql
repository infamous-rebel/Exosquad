-- CreateEnum
CREATE TYPE "AuthenticityStatus" AS ENUM ('UNASSESSED', 'INSUFFICIENT_EVIDENCE', 'VERIFIED', 'LIKELY_AUTHENTIC', 'UNCERTAIN', 'SUSPICIOUS', 'LIKELY_COUNTERFEIT', 'CONTRADICTED');

-- CreateTable
CREATE TABLE "authenticity_assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "AuthenticityStatus" NOT NULL DEFAULT 'UNASSESSED',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "algorithmVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "inputHash" TEXT NOT NULL,
    "calculationHash" TEXT,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    "positiveSignalCount" INTEGER NOT NULL DEFAULT 0,
    "negativeSignalCount" INTEGER NOT NULL DEFAULT 0,
    "dataCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceDiversity" INTEGER NOT NULL DEFAULT 0,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authenticity_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authenticity_signals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "evidenceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authenticity_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authenticity_evidence_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "evidenceRole" TEXT NOT NULL,
    "evidenceStrength" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "effect" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authenticity_evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authenticity_risks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "riskType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authenticity_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authenticity_decisions" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "identityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "brandScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sellerScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "listingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "documentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "corroborationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceQuantityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceQualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "independenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consistencyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contradictionPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "finalConfidence" DOUBLE PRECISION NOT NULL,
    "inputHash" TEXT NOT NULL,
    "evidenceIds" JSONB NOT NULL DEFAULT '[]',
    "signalIds" JSONB NOT NULL DEFAULT '[]',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authenticity_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "authenticity_assessments_tenantId_idx" ON "authenticity_assessments"("tenantId");

-- CreateIndex
CREATE INDEX "authenticity_assessments_tenantId_status_idx" ON "authenticity_assessments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "authenticity_assessments_tenantId_subjectType_subjectId_idx" ON "authenticity_assessments"("tenantId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "authenticity_assessments_tenantId_score_idx" ON "authenticity_assessments"("tenantId", "score");

-- CreateIndex
CREATE INDEX "authenticity_assessments_tenantId_confidence_idx" ON "authenticity_assessments"("tenantId", "confidence");

-- CreateIndex
CREATE INDEX "authenticity_assessments_tenantId_algorithmVersion_idx" ON "authenticity_assessments"("tenantId", "algorithmVersion");

-- CreateIndex
CREATE INDEX "authenticity_assessments_inputHash_idx" ON "authenticity_assessments"("inputHash");

-- CreateIndex
CREATE INDEX "authenticity_assessments_calculationHash_idx" ON "authenticity_assessments"("calculationHash");

-- CreateIndex
CREATE INDEX "authenticity_assessments_assessedAt_idx" ON "authenticity_assessments"("assessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "authenticity_assessments_tenantId_subjectType_subjectId_inp_key" ON "authenticity_assessments"("tenantId", "subjectType", "subjectId", "inputHash");

-- CreateIndex
CREATE INDEX "authenticity_signals_tenantId_idx" ON "authenticity_signals"("tenantId");

-- CreateIndex
CREATE INDEX "authenticity_signals_assessmentId_idx" ON "authenticity_signals"("assessmentId");

-- CreateIndex
CREATE INDEX "authenticity_signals_signalType_idx" ON "authenticity_signals"("signalType");

-- CreateIndex
CREATE INDEX "authenticity_signals_direction_idx" ON "authenticity_signals"("direction");

-- CreateIndex
CREATE INDEX "authenticity_signals_evidenceId_idx" ON "authenticity_signals"("evidenceId");

-- CreateIndex
CREATE INDEX "authenticity_signals_subjectType_subjectId_idx" ON "authenticity_signals"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "authenticity_evidence_links_tenantId_idx" ON "authenticity_evidence_links"("tenantId");

-- CreateIndex
CREATE INDEX "authenticity_evidence_links_assessmentId_idx" ON "authenticity_evidence_links"("assessmentId");

-- CreateIndex
CREATE INDEX "authenticity_evidence_links_evidenceId_idx" ON "authenticity_evidence_links"("evidenceId");

-- CreateIndex
CREATE INDEX "authenticity_evidence_links_evidenceRole_idx" ON "authenticity_evidence_links"("evidenceRole");

-- CreateIndex
CREATE INDEX "authenticity_evidence_links_evidenceStrength_idx" ON "authenticity_evidence_links"("evidenceStrength");

-- CreateIndex
CREATE UNIQUE INDEX "authenticity_evidence_links_assessmentId_evidenceId_key" ON "authenticity_evidence_links"("assessmentId", "evidenceId");

-- CreateIndex
CREATE INDEX "authenticity_risks_tenantId_idx" ON "authenticity_risks"("tenantId");

-- CreateIndex
CREATE INDEX "authenticity_risks_assessmentId_idx" ON "authenticity_risks"("assessmentId");

-- CreateIndex
CREATE INDEX "authenticity_risks_riskType_idx" ON "authenticity_risks"("riskType");

-- CreateIndex
CREATE INDEX "authenticity_risks_severity_idx" ON "authenticity_risks"("severity");

-- CreateIndex
CREATE INDEX "authenticity_decisions_assessmentId_idx" ON "authenticity_decisions"("assessmentId");

-- CreateIndex
CREATE INDEX "authenticity_decisions_calculatedAt_idx" ON "authenticity_decisions"("calculatedAt");

-- CreateIndex
CREATE INDEX "authenticity_decisions_algorithmVersion_idx" ON "authenticity_decisions"("algorithmVersion");

-- CreateIndex
CREATE UNIQUE INDEX "authenticity_decisions_assessmentId_inputHash_key" ON "authenticity_decisions"("assessmentId", "inputHash");

-- AddForeignKey
ALTER TABLE "authenticity_assessments" ADD CONSTRAINT "authenticity_assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authenticity_signals" ADD CONSTRAINT "authenticity_signals_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "authenticity_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authenticity_evidence_links" ADD CONSTRAINT "authenticity_evidence_links_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "authenticity_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authenticity_risks" ADD CONSTRAINT "authenticity_risks_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "authenticity_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authenticity_decisions" ADD CONSTRAINT "authenticity_decisions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "authenticity_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
