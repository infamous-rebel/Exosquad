/*
  Warnings:

  - You are about to drop the column `brand` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `gtin` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `mpn` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `products` table. All the data in the column will be lost.
  - Added the required column `normalizedName` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "products_brand_idx";

-- DropIndex
DROP INDEX "products_gtin_idx";

-- CreateIndex (needed for later rename)
CREATE UNIQUE INDEX IF NOT EXISTS "observations_sourceId_contentHash_unique" ON "observations"("sourceId", "contentHash");

-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "dataQuality" TEXT NOT NULL DEFAULT 'unresolved',
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "productVariantId" TEXT;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "netQuantity" DECIMAL(65,30),
ADD COLUMN     "normalizedName" TEXT,
ADD COLUMN     "packCount" INTEGER,
ADD COLUMN     "perUnitQuantity" DECIMAL(65,30),
ADD COLUMN     "perUnitUnit" TEXT,
ADD COLUMN     "quantityUnit" TEXT,
ADD COLUMN     "totalQuantity" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "products" DROP COLUMN "brand",
DROP COLUMN "category",
DROP COLUMN "country",
DROP COLUMN "gtin",
DROP COLUMN "mpn",
DROP COLUMN "sku",
ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "normalizedName" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "searchKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_aliases" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "searchKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'seed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_identifiers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceSellerId" TEXT,
    "url" TEXT,
    "rating" DECIMAL(65,30),
    "reviewCount" INTEGER,
    "country" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceSupplierId" TEXT,
    "country" TEXT,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "country" TEXT,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normalization_errors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "observationId" TEXT,
    "sourceId" TEXT,
    "sourceRecordId" TEXT,
    "failureCategory" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "rawRecord" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "normalization_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brands_tenantId_idx" ON "brands"("tenantId");

-- CreateIndex
CREATE INDEX "brands_searchKey_idx" ON "brands"("searchKey");

-- CreateIndex
CREATE INDEX "brands_normalizedName_idx" ON "brands"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "brands_tenantId_normalizedName_key" ON "brands"("tenantId", "normalizedName");

-- CreateIndex
CREATE INDEX "brand_aliases_searchKey_idx" ON "brand_aliases"("searchKey");

-- CreateIndex
CREATE INDEX "brand_aliases_normalizedAlias_idx" ON "brand_aliases"("normalizedAlias");

-- CreateIndex
CREATE UNIQUE INDEX "brand_aliases_brandId_normalizedAlias_key" ON "brand_aliases"("brandId", "normalizedAlias");

-- CreateIndex
CREATE INDEX "categories_tenantId_idx" ON "categories"("tenantId");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE INDEX "categories_normalizedName_idx" ON "categories"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenantId_normalizedName_parentId_key" ON "categories"("tenantId", "normalizedName", "parentId");

-- CreateIndex
CREATE INDEX "product_identifiers_productId_idx" ON "product_identifiers"("productId");

-- CreateIndex
CREATE INDEX "product_identifiers_tenantId_idx" ON "product_identifiers"("tenantId");

-- CreateIndex
CREATE INDEX "product_identifiers_type_normalized_idx" ON "product_identifiers"("type", "normalized");

-- CreateIndex
CREATE INDEX "product_identifiers_normalized_idx" ON "product_identifiers"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "product_identifiers_tenantId_type_normalized_key" ON "product_identifiers"("tenantId", "type", "normalized");

-- CreateIndex
CREATE INDEX "sellers_tenantId_idx" ON "sellers"("tenantId");

-- CreateIndex
CREATE INDEX "sellers_normalizedName_idx" ON "sellers"("normalizedName");

-- CreateIndex
CREATE INDEX "sellers_sourceId_idx" ON "sellers"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_tenantId_sourceId_sourceSellerId_key" ON "sellers"("tenantId", "sourceId", "sourceSellerId");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_idx" ON "suppliers"("tenantId");

-- CreateIndex
CREATE INDEX "suppliers_normalizedName_idx" ON "suppliers"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenantId_sourceId_sourceSupplierId_key" ON "suppliers"("tenantId", "sourceId", "sourceSupplierId");

-- CreateIndex
CREATE INDEX "manufacturers_tenantId_idx" ON "manufacturers"("tenantId");

-- CreateIndex
CREATE INDEX "manufacturers_normalizedName_idx" ON "manufacturers"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_tenantId_normalizedName_key" ON "manufacturers"("tenantId", "normalizedName");

-- CreateIndex
CREATE INDEX "normalization_errors_tenantId_idx" ON "normalization_errors"("tenantId");

-- CreateIndex
CREATE INDEX "normalization_errors_observationId_idx" ON "normalization_errors"("observationId");

-- CreateIndex
CREATE INDEX "normalization_errors_sourceId_idx" ON "normalization_errors"("sourceId");

-- CreateIndex
CREATE INDEX "normalization_errors_failureCategory_idx" ON "normalization_errors"("failureCategory");

-- CreateIndex
CREATE INDEX "normalization_errors_createdAt_idx" ON "normalization_errors"("createdAt");

-- CreateIndex
CREATE INDEX "evidence_observationId_idx" ON "evidence"("observationId");

-- CreateIndex
CREATE INDEX "observations_dataQuality_idx" ON "observations"("dataQuality");

-- CreateIndex
CREATE INDEX "observations_brandId_idx" ON "observations"("brandId");

-- CreateIndex
CREATE INDEX "observations_productId_idx" ON "observations"("productId");

-- CreateIndex
CREATE INDEX "product_variants_normalizedName_idx" ON "product_variants"("normalizedName");

-- CreateIndex
CREATE INDEX "products_brandId_idx" ON "products"("brandId");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_normalizedName_idx" ON "products"("normalizedName");

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_aliases" ADD CONSTRAINT "brand_aliases_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normalization_errors" ADD CONSTRAINT "normalization_errors_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "observations_sourceId_contentHash_unique" RENAME TO "observations_sourceId_contentHash_key";
