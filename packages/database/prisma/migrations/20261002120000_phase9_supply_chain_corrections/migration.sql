-- CreateEnum
CREATE TYPE "SupplyChainNodeType" AS ENUM ('PRODUCT', 'SKU', 'BRAND', 'MANUFACTURER', 'AUTHORIZED_DISTRIBUTOR', 'DISTRIBUTOR', 'SUPPLIER', 'SELLER', 'LISTING', 'OFFER', 'FULFILLMENT_PROVIDER', 'WAREHOUSE', 'EXPORTER', 'IMPORTER', 'ORIGIN_COUNTRY', 'ORIGIN_REGION', 'ORIGIN_CITY', 'PORT', 'TRADE_ROUTE', 'SHIPMENT', 'TRADE_OBSERVATION', 'DESTINATION_COUNTRY', 'DESTINATION_REGION', 'DESTINATION_CITY', 'BANGLADESH_MARKET_ENTITY', 'BANGLADESH_IMPORTER', 'BANGLADESH_DISTRIBUTOR', 'BANGLADESH_RESELLER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SupplyChainEdgeType" AS ENUM ('BRAND_MANUFACTURES_PRODUCT', 'MANUFACTURER_PRODUCES_SKU', 'MANUFACTURER_DISTRIBUTES', 'MANUFACTURER_SUPPLIES', 'MANUFACTURER_EXPORTS', 'AUTHORIZED_DISTRIBUTOR_DISTRIBUTES', 'DISTRIBUTOR_SUPPLIES', 'SUPPLIER_SUPPLIES', 'SUPPLIER_SOURCES_FROM', 'SELLER_PURCHASES_FROM', 'SELLER_SUPPLIES', 'SELLER_LISTS', 'SELLER_OFFERS', 'LISTING_REPRESENTS_PRODUCT', 'LISTING_OFFERS_SKU', 'FULFILLMENT_BY', 'STORED_AT', 'ORIGINATED_FROM', 'EXPORTED_FROM', 'IMPORTED_TO', 'EXPORTER_EXPORTS', 'IMPORTER_IMPORTS', 'SHIPMENT_FROM', 'SHIPMENT_TO', 'TRADE_OBSERVATION_SUPPORTS', 'DESTINATION_TO', 'SOLD_IN_MARKET', 'BANGLADESH_IMPORTER_DISTRIBUTES', 'BANGLADESH_DISTRIBUTOR_SUPPLIES', 'BANGLADESH_SUPPLIER_SUPPLIES', 'BANGLADESH_RESELLER_SELLS');

-- CreateEnum
CREATE TYPE "SupplyChainRelationshipStatus" AS ENUM ('OBSERVED', 'CLAIMED', 'INFERRED', 'CORROBORATED', 'CONFIRMED', 'CONTRADICTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SupplyChainConflictResolutionState" AS ENUM ('OPEN', 'RESOLVED', 'SUPERSEDED', 'UNRESOLVED');

-- DropIndex
DROP INDEX "supply_chain_assessments_tenantId_subjectType_subjectId_inp_key";

-- AlterTable
ALTER TABLE "supply_chain_assessments" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "supply_chain_conflicts" DROP COLUMN "resolutionState",
ADD COLUMN     "resolutionState" "SupplyChainConflictResolutionState" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "supply_chain_edges" DROP COLUMN "edgeType",
ADD COLUMN     "edgeType" "SupplyChainEdgeType" NOT NULL,
DROP COLUMN "relationshipStatus",
ADD COLUMN     "relationshipStatus" "SupplyChainRelationshipStatus" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "supply_chain_nodes" DROP COLUMN "nodeType",
ADD COLUMN     "nodeType" "SupplyChainNodeType" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "supply_chain_assessments_tenantId_subjectType_subjectId_ver_key" ON "supply_chain_assessments"("tenantId", "subjectType", "subjectId", "version");

-- CreateIndex
CREATE INDEX "supply_chain_conflicts_resolutionState_idx" ON "supply_chain_conflicts"("resolutionState");

-- CreateIndex
CREATE INDEX "supply_chain_edges_edgeType_idx" ON "supply_chain_edges"("edgeType");

-- CreateIndex
CREATE INDEX "supply_chain_edges_relationshipStatus_idx" ON "supply_chain_edges"("relationshipStatus");

-- CreateIndex
CREATE UNIQUE INDEX "supply_chain_edges_tenantId_fromNodeId_toNodeId_edgeType_co_key" ON "supply_chain_edges"("tenantId", "fromNodeId", "toNodeId", "edgeType", "contentHash");

-- CreateIndex
CREATE INDEX "supply_chain_nodes_nodeType_idx" ON "supply_chain_nodes"("nodeType");

-- CreateIndex
CREATE UNIQUE INDEX "supply_chain_nodes_tenantId_nodeType_normalizedName_sourceI_key" ON "supply_chain_nodes"("tenantId", "nodeType", "normalizedName", "sourceId");

-- Partial unique index: same canonical entity cannot create duplicate logical nodes for same tenant/type
-- Only applies when canonicalEntityId IS NOT NULL (nodes without canonical refs are exempt)
CREATE UNIQUE INDEX "supply_chain_nodes_canonical_entity_unique" 
  ON "supply_chain_nodes"("tenantId", "nodeType", "canonicalEntityType", "canonicalEntityId")
  WHERE "canonicalEntityId" IS NOT NULL;

