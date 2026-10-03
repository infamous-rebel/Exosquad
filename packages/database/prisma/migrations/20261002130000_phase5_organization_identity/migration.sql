-- AlterTable
ALTER TABLE "manufacturers" ADD COLUMN     "domain" TEXT,
ADD COLUMN     "identityStatus" TEXT NOT NULL DEFAULT 'unresolved',
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "searchKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tradingName" TEXT;

-- AlterTable
ALTER TABLE "product_attributes" ALTER COLUMN "observedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "modelVersion" TEXT;

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "domain" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "identityStatus" TEXT NOT NULL DEFAULT 'unresolved',
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "searchKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "storefrontName" TEXT;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "identityStatus" TEXT NOT NULL DEFAULT 'unresolved',
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "searchKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "supplierRole" TEXT,
ADD COLUMN     "tradingName" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "searchKey" TEXT NOT NULL DEFAULT '',
    "legalName" TEXT,
    "tradingName" TEXT,
    "website" TEXT,
    "domain" TEXT,
    "country" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "identityStatus" TEXT NOT NULL DEFAULT 'unresolved',
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "status" TEXT NOT NULL DEFAULT 'active',
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "evidenceSource" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_identifiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "country" TEXT,
    "sourceId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_domains" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'source',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_emails" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isCorporate" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'source',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_phones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rawPhone" TEXT NOT NULL,
    "normalizedPhone" TEXT,
    "countryCode" TEXT,
    "source" TEXT NOT NULL DEFAULT 'source',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_locations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationType" TEXT NOT NULL,
    "address" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'source',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "source" TEXT NOT NULL DEFAULT 'source',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_relationships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromOrgId" TEXT NOT NULL,
    "toOrgId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "observationType" TEXT NOT NULL DEFAULT 'observed',
    "sourceId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sellers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "sellerSku" TEXT,
    "sellerProductId" TEXT,
    "listingUrl" TEXT,
    "price" DECIMAL(65,30),
    "currency" TEXT,
    "availability" TEXT,
    "stockStatus" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_suppliers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierProductId" TEXT,
    "moq" INTEGER,
    "unitPack" TEXT,
    "price" DECIMAL(65,30),
    "currency" TEXT,
    "availability" TEXT,
    "leadTimeDays" INTEGER,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_identity_decisions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromOrgId" TEXT NOT NULL,
    "toOrgId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "nameMatch" TEXT,
    "domainMatch" TEXT,
    "emailMatch" TEXT,
    "phoneMatch" TEXT,
    "addressMatch" TEXT,
    "registrationMatch" TEXT,
    "sourceIdMatch" TEXT,
    "countryMatch" TEXT,
    "websiteMatch" TEXT,
    "roleCompatibility" TEXT,
    "conflictState" TEXT,
    "sourceReliability" DOUBLE PRECISION,
    "method" TEXT NOT NULL DEFAULT 'deterministic',
    "methodVersion" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_identity_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_identity_conflicts" (
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

    CONSTRAINT "org_identity_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_identity_candidates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromOrgId" TEXT NOT NULL,
    "toOrgId" TEXT NOT NULL,
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

    CONSTRAINT "org_identity_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_merge_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromOrgId" TEXT,
    "toOrgId" TEXT,
    "reason" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "actorId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reverseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_merge_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizations_tenantId_idx" ON "organizations"("tenantId");

-- CreateIndex
CREATE INDEX "organizations_normalizedName_idx" ON "organizations"("normalizedName");

-- CreateIndex
CREATE INDEX "organizations_searchKey_idx" ON "organizations"("searchKey");

-- CreateIndex
CREATE INDEX "organizations_domain_idx" ON "organizations"("domain");

-- CreateIndex
CREATE INDEX "organizations_identityStatus_idx" ON "organizations"("identityStatus");

-- CreateIndex
CREATE INDEX "organizations_country_idx" ON "organizations"("country");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tenantId_normalizedName_key" ON "organizations"("tenantId", "normalizedName");

-- CreateIndex
CREATE INDEX "organization_roles_tenantId_idx" ON "organization_roles"("tenantId");

-- CreateIndex
CREATE INDEX "organization_roles_organizationId_idx" ON "organization_roles"("organizationId");

-- CreateIndex
CREATE INDEX "organization_roles_role_idx" ON "organization_roles"("role");

-- CreateIndex
CREATE UNIQUE INDEX "organization_roles_tenantId_organizationId_role_key" ON "organization_roles"("tenantId", "organizationId", "role");

-- CreateIndex
CREATE INDEX "organization_identifiers_tenantId_idx" ON "organization_identifiers"("tenantId");

-- CreateIndex
CREATE INDEX "organization_identifiers_organizationId_idx" ON "organization_identifiers"("organizationId");

-- CreateIndex
CREATE INDEX "organization_identifiers_type_normalized_idx" ON "organization_identifiers"("type", "normalized");

-- CreateIndex
CREATE INDEX "organization_identifiers_normalized_idx" ON "organization_identifiers"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "organization_identifiers_tenantId_type_normalized_key" ON "organization_identifiers"("tenantId", "type", "normalized");

-- CreateIndex
CREATE INDEX "organization_domains_tenantId_idx" ON "organization_domains"("tenantId");

-- CreateIndex
CREATE INDEX "organization_domains_organizationId_idx" ON "organization_domains"("organizationId");

-- CreateIndex
CREATE INDEX "organization_domains_domain_idx" ON "organization_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "organization_domains_tenantId_domain_key" ON "organization_domains"("tenantId", "domain");

-- CreateIndex
CREATE INDEX "organization_emails_tenantId_idx" ON "organization_emails"("tenantId");

-- CreateIndex
CREATE INDEX "organization_emails_organizationId_idx" ON "organization_emails"("organizationId");

-- CreateIndex
CREATE INDEX "organization_emails_domain_idx" ON "organization_emails"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "organization_emails_tenantId_normalizedEmail_key" ON "organization_emails"("tenantId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "organization_phones_tenantId_idx" ON "organization_phones"("tenantId");

-- CreateIndex
CREATE INDEX "organization_phones_organizationId_idx" ON "organization_phones"("organizationId");

-- CreateIndex
CREATE INDEX "organization_phones_normalizedPhone_idx" ON "organization_phones"("normalizedPhone");

-- CreateIndex
CREATE UNIQUE INDEX "organization_phones_tenantId_normalizedPhone_key" ON "organization_phones"("tenantId", "normalizedPhone");

-- CreateIndex
CREATE INDEX "organization_locations_tenantId_idx" ON "organization_locations"("tenantId");

-- CreateIndex
CREATE INDEX "organization_locations_organizationId_idx" ON "organization_locations"("organizationId");

-- CreateIndex
CREATE INDEX "organization_locations_country_idx" ON "organization_locations"("country");

-- CreateIndex
CREATE INDEX "organization_locations_city_idx" ON "organization_locations"("city");

-- CreateIndex
CREATE INDEX "organization_contacts_tenantId_idx" ON "organization_contacts"("tenantId");

-- CreateIndex
CREATE INDEX "organization_contacts_organizationId_idx" ON "organization_contacts"("organizationId");

-- CreateIndex
CREATE INDEX "commercial_relationships_tenantId_idx" ON "commercial_relationships"("tenantId");

-- CreateIndex
CREATE INDEX "commercial_relationships_fromOrgId_idx" ON "commercial_relationships"("fromOrgId");

-- CreateIndex
CREATE INDEX "commercial_relationships_toOrgId_idx" ON "commercial_relationships"("toOrgId");

-- CreateIndex
CREATE INDEX "commercial_relationships_relationshipType_idx" ON "commercial_relationships"("relationshipType");

-- CreateIndex
CREATE INDEX "commercial_relationships_status_idx" ON "commercial_relationships"("status");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_relationships_tenantId_fromOrgId_toOrgId_relatio_key" ON "commercial_relationships"("tenantId", "fromOrgId", "toOrgId", "relationshipType");

-- CreateIndex
CREATE INDEX "product_sellers_tenantId_idx" ON "product_sellers"("tenantId");

-- CreateIndex
CREATE INDEX "product_sellers_productId_idx" ON "product_sellers"("productId");

-- CreateIndex
CREATE INDEX "product_sellers_sellerId_idx" ON "product_sellers"("sellerId");

-- CreateIndex
CREATE INDEX "product_sellers_observedAt_idx" ON "product_sellers"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_sellers_tenantId_productId_sellerId_sellerSku_key" ON "product_sellers"("tenantId", "productId", "sellerId", "sellerSku");

-- CreateIndex
CREATE INDEX "product_suppliers_tenantId_idx" ON "product_suppliers"("tenantId");

-- CreateIndex
CREATE INDEX "product_suppliers_productId_idx" ON "product_suppliers"("productId");

-- CreateIndex
CREATE INDEX "product_suppliers_supplierId_idx" ON "product_suppliers"("supplierId");

-- CreateIndex
CREATE INDEX "product_suppliers_observedAt_idx" ON "product_suppliers"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_suppliers_tenantId_productId_supplierId_supplierPro_key" ON "product_suppliers"("tenantId", "productId", "supplierId", "supplierProductId");

-- CreateIndex
CREATE INDEX "org_identity_decisions_tenantId_idx" ON "org_identity_decisions"("tenantId");

-- CreateIndex
CREATE INDEX "org_identity_decisions_fromOrgId_idx" ON "org_identity_decisions"("fromOrgId");

-- CreateIndex
CREATE INDEX "org_identity_decisions_toOrgId_idx" ON "org_identity_decisions"("toOrgId");

-- CreateIndex
CREATE INDEX "org_identity_decisions_decision_idx" ON "org_identity_decisions"("decision");

-- CreateIndex
CREATE INDEX "org_identity_decisions_method_idx" ON "org_identity_decisions"("method");

-- CreateIndex
CREATE INDEX "org_identity_decisions_createdAt_idx" ON "org_identity_decisions"("createdAt");

-- CreateIndex
CREATE INDEX "org_identity_conflicts_tenantId_idx" ON "org_identity_conflicts"("tenantId");

-- CreateIndex
CREATE INDEX "org_identity_conflicts_entityId_idx" ON "org_identity_conflicts"("entityId");

-- CreateIndex
CREATE INDEX "org_identity_conflicts_conflictType_idx" ON "org_identity_conflicts"("conflictType");

-- CreateIndex
CREATE INDEX "org_identity_conflicts_status_idx" ON "org_identity_conflicts"("status");

-- CreateIndex
CREATE INDEX "org_identity_conflicts_severity_idx" ON "org_identity_conflicts"("severity");

-- CreateIndex
CREATE INDEX "org_identity_candidates_tenantId_idx" ON "org_identity_candidates"("tenantId");

-- CreateIndex
CREATE INDEX "org_identity_candidates_status_idx" ON "org_identity_candidates"("status");

-- CreateIndex
CREATE INDEX "org_identity_candidates_priority_idx" ON "org_identity_candidates"("priority");

-- CreateIndex
CREATE INDEX "org_identity_candidates_fromOrgId_idx" ON "org_identity_candidates"("fromOrgId");

-- CreateIndex
CREATE INDEX "org_identity_candidates_toOrgId_idx" ON "org_identity_candidates"("toOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "org_identity_candidates_tenantId_fromOrgId_toOrgId_key" ON "org_identity_candidates"("tenantId", "fromOrgId", "toOrgId");

-- CreateIndex
CREATE INDEX "org_merge_history_tenantId_idx" ON "org_merge_history"("tenantId");

-- CreateIndex
CREATE INDEX "org_merge_history_entityId_idx" ON "org_merge_history"("entityId");

-- CreateIndex
CREATE INDEX "org_merge_history_action_idx" ON "org_merge_history"("action");

-- CreateIndex
CREATE INDEX "org_merge_history_createdAt_idx" ON "org_merge_history"("createdAt");

-- CreateIndex
CREATE INDEX "manufacturers_searchKey_idx" ON "manufacturers"("searchKey");

-- CreateIndex
CREATE INDEX "manufacturers_domain_idx" ON "manufacturers"("domain");

-- CreateIndex
CREATE INDEX "manufacturers_identityStatus_idx" ON "manufacturers"("identityStatus");

-- CreateIndex
CREATE INDEX "manufacturers_organizationId_idx" ON "manufacturers"("organizationId");

-- CreateIndex
CREATE INDEX "sellers_searchKey_idx" ON "sellers"("searchKey");

-- CreateIndex
CREATE INDEX "sellers_domain_idx" ON "sellers"("domain");

-- CreateIndex
CREATE INDEX "sellers_identityStatus_idx" ON "sellers"("identityStatus");

-- CreateIndex
CREATE INDEX "sellers_organizationId_idx" ON "sellers"("organizationId");

-- CreateIndex
CREATE INDEX "suppliers_searchKey_idx" ON "suppliers"("searchKey");

-- CreateIndex
CREATE INDEX "suppliers_domain_idx" ON "suppliers"("domain");

-- CreateIndex
CREATE INDEX "suppliers_identityStatus_idx" ON "suppliers"("identityStatus");

-- CreateIndex
CREATE INDEX "suppliers_organizationId_idx" ON "suppliers"("organizationId");

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_roles" ADD CONSTRAINT "organization_roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_identifiers" ADD CONSTRAINT "organization_identifiers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_emails" ADD CONSTRAINT "organization_emails_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_phones" ADD CONSTRAINT "organization_phones_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_locations" ADD CONSTRAINT "organization_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_relationships" ADD CONSTRAINT "commercial_relationships_fromOrgId_fkey" FOREIGN KEY ("fromOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_relationships" ADD CONSTRAINT "commercial_relationships_toOrgId_fkey" FOREIGN KEY ("toOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sellers" ADD CONSTRAINT "product_sellers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sellers" ADD CONSTRAINT "product_sellers_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_identity_decisions" ADD CONSTRAINT "org_identity_decisions_fromOrgId_fkey" FOREIGN KEY ("fromOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_identity_decisions" ADD CONSTRAINT "org_identity_decisions_toOrgId_fkey" FOREIGN KEY ("toOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_identity_conflicts" ADD CONSTRAINT "org_identity_conflicts_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_identity_candidates" ADD CONSTRAINT "org_identity_candidates_fromOrgId_fkey" FOREIGN KEY ("fromOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_identity_candidates" ADD CONSTRAINT "org_identity_candidates_toOrgId_fkey" FOREIGN KEY ("toOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_merge_history" ADD CONSTRAINT "org_merge_history_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "identity_relationships_tenantId_fromProductId_toProduc_key" RENAME TO "identity_relationships_tenantId_fromProductId_toProductId_r_key";
