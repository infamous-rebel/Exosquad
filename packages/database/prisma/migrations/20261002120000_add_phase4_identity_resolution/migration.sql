-- Phase 4: Identity Resolution Schema
-- Adds identity resolution tables and enhances existing product/variant tables.

-- AlterTable: Add searchKey and identityStatus to products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "searchKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "identityStatus" TEXT NOT NULL DEFAULT 'unresolved';

-- AlterTable: Add new fields to product_variants
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "searchKey" TEXT;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "formulation" TEXT;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "flavor" TEXT;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "scent" TEXT;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "concentration" TEXT;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "strength" TEXT;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "spf" TEXT;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "ageGroup" TEXT;
ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "genderTarget" TEXT;

-- CreateTable: Identity Relationships
CREATE TABLE IF NOT EXISTS "identity_relationships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "decisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Identity Decisions
CREATE TABLE IF NOT EXISTS "identity_decisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "identifierMatch" TEXT,
    "brandMatch" TEXT,
    "nameMatch" TEXT,
    "variantMatch" TEXT,
    "quantityMatch" TEXT,
    "packMatch" TEXT,
    "countryMatch" TEXT,
    "manufacturerMatch" TEXT,
    "conflictState" TEXT,
    "sourceReliability" DOUBLE PRECISION,
    "method" TEXT NOT NULL DEFAULT 'deterministic',
    "methodVersion" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Identity Conflicts
CREATE TABLE IF NOT EXISTS "identity_conflicts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "conflictType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "conflictingData" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Identity Candidates
CREATE TABLE IF NOT EXISTS "identity_candidates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "generationMethod" TEXT NOT NULL DEFAULT 'blocking',
    "blockingKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Identity Merge History
CREATE TABLE IF NOT EXISTS "identity_merge_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromProductId" TEXT,
    "toProductId" TEXT,
    "reason" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "actorId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reverseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_merge_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Product Attributes
CREATE TABLE IF NOT EXISTS "product_attributes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "originalValue" TEXT NOT NULL,
    "unit" TEXT,
    "source" TEXT NOT NULL DEFAULT 'extraction',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Source Reliability
CREATE TABLE IF NOT EXISTS "source_reliability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "identifierReliability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "metadataReliability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "historicalConsistency" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "manufacturerAuthority" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "marketplaceAuthority" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "totalObservations" INTEGER NOT NULL DEFAULT 0,
    "confirmedMatches" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_reliability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Identity Relationships
CREATE UNIQUE INDEX IF NOT EXISTS "identity_relationships_tenantId_fromProductId_toProduc_key"
  ON "identity_relationships"("tenantId", "fromProductId", "toProductId", "relationshipType");
CREATE INDEX IF NOT EXISTS "identity_relationships_tenantId_idx" ON "identity_relationships"("tenantId");
CREATE INDEX IF NOT EXISTS "identity_relationships_fromProductId_idx" ON "identity_relationships"("fromProductId");
CREATE INDEX IF NOT EXISTS "identity_relationships_toProductId_idx" ON "identity_relationships"("toProductId");
CREATE INDEX IF NOT EXISTS "identity_relationships_relationshipType_idx" ON "identity_relationships"("relationshipType");
CREATE INDEX IF NOT EXISTS "identity_relationships_status_idx" ON "identity_relationships"("status");

-- CreateIndex: Identity Decisions
CREATE INDEX IF NOT EXISTS "identity_decisions_tenantId_idx" ON "identity_decisions"("tenantId");
CREATE INDEX IF NOT EXISTS "identity_decisions_fromProductId_idx" ON "identity_decisions"("fromProductId");
CREATE INDEX IF NOT EXISTS "identity_decisions_toProductId_idx" ON "identity_decisions"("toProductId");
CREATE INDEX IF NOT EXISTS "identity_decisions_decision_idx" ON "identity_decisions"("decision");
CREATE INDEX IF NOT EXISTS "identity_decisions_method_idx" ON "identity_decisions"("method");
CREATE INDEX IF NOT EXISTS "identity_decisions_createdAt_idx" ON "identity_decisions"("createdAt");

-- CreateIndex: Identity Conflicts
CREATE INDEX IF NOT EXISTS "identity_conflicts_tenantId_idx" ON "identity_conflicts"("tenantId");
CREATE INDEX IF NOT EXISTS "identity_conflicts_entityId_idx" ON "identity_conflicts"("entityId");
CREATE INDEX IF NOT EXISTS "identity_conflicts_conflictType_idx" ON "identity_conflicts"("conflictType");
CREATE INDEX IF NOT EXISTS "identity_conflicts_status_idx" ON "identity_conflicts"("status");
CREATE INDEX IF NOT EXISTS "identity_conflicts_severity_idx" ON "identity_conflicts"("severity");

-- CreateIndex: Identity Candidates
CREATE UNIQUE INDEX IF NOT EXISTS "identity_candidates_tenantId_fromProductId_toProductId_key"
  ON "identity_candidates"("tenantId", "fromProductId", "toProductId");
CREATE INDEX IF NOT EXISTS "identity_candidates_tenantId_idx" ON "identity_candidates"("tenantId");
CREATE INDEX IF NOT EXISTS "identity_candidates_status_idx" ON "identity_candidates"("status");
CREATE INDEX IF NOT EXISTS "identity_candidates_priority_idx" ON "identity_candidates"("priority");
CREATE INDEX IF NOT EXISTS "identity_candidates_fromProductId_idx" ON "identity_candidates"("fromProductId");
CREATE INDEX IF NOT EXISTS "identity_candidates_toProductId_idx" ON "identity_candidates"("toProductId");

-- CreateIndex: Identity Merge History
CREATE INDEX IF NOT EXISTS "identity_merge_history_tenantId_idx" ON "identity_merge_history"("tenantId");
CREATE INDEX IF NOT EXISTS "identity_merge_history_entityId_idx" ON "identity_merge_history"("entityId");
CREATE INDEX IF NOT EXISTS "identity_merge_history_action_idx" ON "identity_merge_history"("action");
CREATE INDEX IF NOT EXISTS "identity_merge_history_createdAt_idx" ON "identity_merge_history"("createdAt");

-- CreateIndex: Product Attributes
CREATE UNIQUE INDEX IF NOT EXISTS "product_attributes_tenantId_productId_name_value_key"
  ON "product_attributes"("tenantId", "productId", "name", "value");
CREATE INDEX IF NOT EXISTS "product_attributes_tenantId_idx" ON "product_attributes"("tenantId");
CREATE INDEX IF NOT EXISTS "product_attributes_productId_idx" ON "product_attributes"("productId");
CREATE INDEX IF NOT EXISTS "product_attributes_name_idx" ON "product_attributes"("name");

-- CreateIndex: Source Reliability
CREATE UNIQUE INDEX IF NOT EXISTS "source_reliability_sourceId_key" ON "source_reliability"("sourceId");
CREATE INDEX IF NOT EXISTS "source_reliability_tenantId_idx" ON "source_reliability"("tenantId");

-- CreateIndex: Products (new indexes)
CREATE INDEX IF NOT EXISTS "products_searchKey_idx" ON "products"("searchKey");
CREATE INDEX IF NOT EXISTS "products_identityStatus_idx" ON "products"("identityStatus");

-- CreateIndex: Product Variants (new index)
CREATE INDEX IF NOT EXISTS "product_variants_searchKey_idx" ON "product_variants"("searchKey");

-- AddForeignKey: Identity Relationships
ALTER TABLE "identity_relationships" ADD CONSTRAINT "identity_relationships_fromProductId_fkey"
  FOREIGN KEY ("fromProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_relationships" ADD CONSTRAINT "identity_relationships_toProductId_fkey"
  FOREIGN KEY ("toProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Identity Decisions
ALTER TABLE "identity_decisions" ADD CONSTRAINT "identity_decisions_fromProductId_fkey"
  FOREIGN KEY ("fromProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_decisions" ADD CONSTRAINT "identity_decisions_toProductId_fkey"
  FOREIGN KEY ("toProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Identity Conflicts
ALTER TABLE "identity_conflicts" ADD CONSTRAINT "identity_conflicts_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Identity Candidates
ALTER TABLE "identity_candidates" ADD CONSTRAINT "identity_candidates_fromProductId_fkey"
  FOREIGN KEY ("fromProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_candidates" ADD CONSTRAINT "identity_candidates_toProductId_fkey"
  FOREIGN KEY ("toProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Identity Merge History
ALTER TABLE "identity_merge_history" ADD CONSTRAINT "identity_merge_history_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Product Attributes
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
