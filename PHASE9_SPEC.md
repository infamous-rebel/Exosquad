# EXOSQUAD — Phase 9: Supply-Chain Tracing & Provenance Graph Engine

## Implementation Specification v1.0

---

## 1. Execution Mandate

This document is the authoritative implementation specification for **Original Roadmap Phase 9 — Supply-Chain Tracing & Provenance Graph Engine**.

The implementation is:
- Production-grade, deterministic, evidence-backed
- Temporally reconstructable and multi-tenant safe
- Idempotent, auditable, API-accessible, worker/scheduler-compatible
- Test-covered and documented
- Compatible with all previously completed phases (1–8)

This is NOT a prototype, mock, or scaffold. Every component described herein must be fully implemented and verified.

---

## 2. Preservation Requirements

The following existing systems MUST remain fully operational and unchanged unless a minimal, documented integration change is strictly necessary:

| System | Phase | Files to Preserve |
|--------|-------|-------------------|
| Demand & Trend Intelligence | Original 7 | `demand-engine.ts`, `demand-intelligence.ts`, `demand-signals.ts`, `DemandSignal`, `DemandCalculation` |
| Authenticity Intelligence | Original 8 | `authenticity-engine.ts`, `authenticity-intelligence.ts`, `AuthenticityAssessment`, `AuthenticitySignal`, `AuthenticityEvidenceLink`, `AuthenticityRisk`, `AuthenticityDecision` |
| Opportunity / Decision Intelligence | Original 13 | `opportunity-engine.ts`, `decision-intelligence.ts`, `opportunities.ts`, `Opportunity`, `OpportunityCalculation`, `OpportunityEvidence`, `OpportunityRisk`, `OpportunityAction` |
| Product/SKU Identity Resolution | 4 | `Product`, `ProductVariant`, `ProductIdentifier`, `IdentityRelationship`, `IdentityDecision`, `IdentityConflict`, `IdentityCandidate`, `IdentityMergeHistory` |
| Seller/Supplier/Org Identity | 5 | `Seller`, `Supplier`, `Manufacturer`, `Organization`, `CommercialRelationship`, `ProductSeller`, `ProductSupplier`, `OrganizationRole`, all org sub-models |
| Evidence & Provenance | 6 | `Evidence`, `Claim`, `EvidenceConflict`, `Calculation`, `ProvenanceEdge` |
| Sources & Ingestion | 1–2 | `Source`, `Observation`, `RawResponse`, `IngestionCheckpoint` |

---

## 3. Repository Audit Results & Reuse Strategy

### 3.1 Existing Components Reused Directly

| Component | Model(s) | How Reused |
|-----------|----------|------------|
| Product identity | `Product`, `ProductVariant` | SupplyChainNode references via `canonicalEntityType`/`canonicalEntityId` |
| Brand identity | `Brand` | SupplyChainNode references for BRAND nodes |
| Seller identity | `Seller` | SupplyChainNode references for SELLER nodes |
| Supplier identity | `Supplier` | SupplyChainNode references for SUPPLIER nodes |
| Manufacturer identity | `Manufacturer` | SupplyChainNode references for MANUFACTURER nodes |
| Organization canonical | `Organization` | SupplyChainNode references for DISTRIBUTOR, IMPORTER, EXPORTER nodes |
| Source | `Source` | All evidence traces back to Source |
| Evidence | `Evidence` | SupplyChainEvidenceLink references existing Evidence records |
| Observation | `Observation` | Raw source observations feed supply-chain evidence |

### 3.2 Existing Components Extended (Minimal Changes)

| Component | Change |
|-----------|--------|
| `Tenant` model | Add back-relation: `supplyChainNodes`, `supplyChainEdges`, etc. |
| `@exosquad/common` | Add Phase 9 enums, types, and config constants |
| `apps/api/src/app.ts` | Register new supply-chain routes |
| `apps/worker/src/app.ts` | Register SupplyChainScheduler |
| `apps/worker/src/queues/queue-manager.ts` | Register `supply_chain` queue + worker |

### 3.3 New Components Created

All supply-chain-specific models, services, routes, workers, and schedulers are new.

---

## 4. Data Model — New Prisma Models

### 4.1 Enum: SupplyChainNodeType

```
PRODUCT, SKU, BRAND, MANUFACTURER,
AUTHORIZED_DISTRIBUTOR, DISTRIBUTOR,
SUPPLIER, SELLER,
LISTING, OFFER,
FULFILLMENT_PROVIDER, WAREHOUSE,
EXPORTER, IMPORTER,
ORIGIN_COUNTRY, ORIGIN_REGION, ORIGIN_CITY,
PORT, TRADE_ROUTE,
SHIPMENT, TRADE_OBSERVATION,
DESTINATION_COUNTRY, DESTINATION_REGION, DESTINATION_CITY,
BANGLADESH_MARKET_ENTITY, BANGLADESH_IMPORTER,
BANGLADESH_DISTRIBUTOR, BANGLADESH_RESELLER,
UNKNOWN
```

### 4.2 Enum: SupplyChainEdgeType

```
BRAND_MANUFACTURES_PRODUCT, MANUFACTURER_PRODUCES_SKU,
MANUFACTURER_DISTRIBUTES, MANUFACTURER_SUPPLIES, MANUFACTURER_EXPORTS,
AUTHORIZED_DISTRIBUTOR_DISTRIBUTES, DISTRIBUTOR_SUPPLIES,
SUPPLIER_SUPPLIES, SUPPLIER_SOURCES_FROM,
SELLER_PURCHASES_FROM, SELLER_SUPPLIES, SELLER_LISTS, SELLER_OFFERS,
LISTING_REPRESENTS_PRODUCT, LISTING_OFFERS_SKU,
FULFILLMENT_BY, STORED_AT,
ORIGINATED_FROM, EXPORTED_FROM, IMPORTED_TO,
EXPORTER_EXPORTS, IMPORTER_IMPORTS,
SHIPMENT_FROM, SHIPMENT_TO,
TRADE_OBSERVATION_SUPPORTS,
DESTINATION_TO, SOLD_IN_MARKET,
BANGLADESH_IMPORTER_DISTRIBUTES, BANGLADESH_DISTRIBUTOR_SUPPLIES,
BANGLADESH_SUPPLIER_SUPPLIES, BANGLADESH_RESELLER_SELLS
```

### 4.3 Enum: SupplyChainRelationshipStatus

```
OBSERVED, CLAIMED, INFERRED, CORROBORATED, CONFIRMED, CONTRADICTED, UNKNOWN
```

### 4.4 Enum: SupplyChainConflictResolutionState

```
OPEN, RESOLVED, SUPERSEDED, UNRESOLVED
```

### 4.5 Model: SupplyChainNode

```
SupplyChainNode {
  id                  String    @id @default(cuid())
  tenantId            String
  nodeType            SupplyChainNodeType
  name                String
  normalizedName      String
  canonicalEntityType String?   // "product" | "productVariant" | "brand" | "seller" | "supplier" | "manufacturer" | "organization" | null
  canonicalEntityId   String?   // FK to the canonical entity where applicable
  sourceEntityId      String?   // external representation ID from a source
  sourceId            String?   // which source provided this node
  country             String?   // ISO 3166-1 alpha-2
  identityStatus      String    @default("unresolved") // resolved | high_confidence | possible | ambiguous | conflict | unresolved
  identityConfidence  Float     @default(0.0)
  metadata            Json      @default("{}")
  observedAt          DateTime  @default(now())
  retrievedAt         DateTime  @default(now())
  validFrom           DateTime?
  validTo             DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  tenant              Tenant
  // No direct FKs to canonical entities to avoid circular schema issues;
  // resolution is application-level via canonicalEntityType/Id polymorphic reference.

  @@unique([tenantId, nodeType, normalizedName, sourceId])
  @@unique([tenantId, nodeType, canonicalEntityType, canonicalEntityId]) where canonicalEntityId is set
  @@index([tenantId])
  @@index([nodeType])
  @@index([canonicalEntityType, canonicalEntityId])
  @@index([normalizedName])
  @@index([identityStatus])
  @@index([country])
  @@map("supply_chain_nodes")
}
```

### 4.6 Model: SupplyChainEdge

```
SupplyChainEdge {
  id                  String                          @id @default(cuid())
  tenantId            String
  fromNodeId          String
  toNodeId            String
  edgeType            SupplyChainEdgeType
  relationshipStatus  SupplyChainRelationshipStatus   @default(UNKNOWN)
  confidence          Float                           @default(0.0)
  evidenceStrength    Float                           @default(0.0)
  sourceDiversity     Int                             @default(0)
  evidenceCount       Int                             @default(0)
  observationCount    Int                             @default(0)
  isContradicted      Boolean                         @default(false)
  contradictionCount  Int                             @default(0)
  contentHash         String?                         // SHA-256 of canonical inputs for dedup
  directness          String                          @default("direct") // direct | inferred
  algorithmVersion    String                          @default("SUPPLY_CHAIN_ALGORITHM_V1")
  observedAt          DateTime                        @default(now())
  validFrom           DateTime?
  validTo             DateTime?
  metadata            Json                            @default("{}")
  createdAt           DateTime                        @default(now())
  updatedAt           DateTime                        @updatedAt

  tenant              Tenant
  fromNode            SupplyChainNode                 @relation("EdgeFromNode", fields: [fromNodeId], references: [id])
  toNode              SupplyChainNode                 @relation("EdgeToNode", fields: [toNodeId], references: [id])

  @@unique([tenantId, fromNodeId, toNodeId, edgeType, contentHash])
  @@index([tenantId])
  @@index([fromNodeId])
  @@index([toNodeId])
  @@index([edgeType])
  @@index([relationshipStatus])
  @@index([contentHash])
  @@index([confidence])
  @@index([isContradicted])
  @@index([validFrom, validTo])
  @@map("supply_chain_edges")
}
```

### 4.7 Model: SupplyChainObservation

Immutable. Never overwritten. New evidence creates new observations.

```
SupplyChainObservation {
  id                  String    @id @default(cuid())
  tenantId            String
  edgeId              String
  sourceId            String
  evidenceId          String?   // link to Phase 6 Evidence
  observationStatus   String    @default("observed") // observed | inferred | probable | unknown
  observedValue       Json      // what was observed about this relationship
  contentHash         String    // SHA-256 for dedup
  observedAt          DateTime
  retrievedAt         DateTime
  validFrom           DateTime?
  validTo             DateTime?
  parserVersion       String?
  createdAt           DateTime  @default(now())

  tenant              Tenant
  edge                SupplyChainEdge @relation(fields: [edgeId], references: [id])
  source              Source          @relation(fields: [sourceId], references: [id])
  evidence            Evidence?       @relation(fields: [evidenceId], references: [id])

  @@unique([tenantId, edgeId, sourceId, contentHash])
  @@index([tenantId])
  @@index([edgeId])
  @@index([sourceId])
  @@index([evidenceId])
  @@index([contentHash])
  @@index([observedAt])
  @@index([observationStatus])
  @@map("supply_chain_observations")
}
```

### 4.8 Model: SupplyChainEvidenceLink

```
SupplyChainEvidenceLink {
  id              String   @id @default(cuid())
  tenantId        String
  edgeId          String
  evidenceId      String   // Phase 6 Evidence
  evidenceRole    String   // SUPPORTING | CONTRADICTING | CONTEXTUAL | UNRESOLVED
  evidenceStrength String  // DIRECT | STRONG | MODERATE | WEAK | CONTEXTUAL
  relevance       Float    @default(1.0) // 0.0–1.0
  effect          Float    @default(0.0) // -1.0 to 1.0
  sourceId        String?
  observedAt      DateTime @default(now())
  createdAt       DateTime @default(now())

  tenant          Tenant
  edge            SupplyChainEdge @relation(fields: [edgeId], references: [id])
  evidence        Evidence        @relation("SCEvidenceLink", fields: [evidenceId], references: [id])

  @@unique([edgeId, evidenceId])
  @@index([tenantId])
  @@index([edgeId])
  @@index([evidenceId])
  @@index([evidenceRole])
  @@map("supply_chain_evidence_links")
}
```

### 4.9 Model: SupplyChainConflict

```
SupplyChainConflict {
  id                  String   @id @default(cuid())
  tenantId            String
  edgeId              String?
  nodeId              String?
  conflictType        String   // CONTRADICTORY_MANUFACTURER | CONTRADICTORY_ORIGIN | TEMPORAL_OVERLAP | SUSPICIOUS_SHORTCUT | SELF_LOOP | INVALID_RELATIONSHIP | CONTRADICTORY_EVIDENCE
  severity            String   // low | medium | high | critical
  description         String
  supportingEvidenceId    String
  contradictingEvidenceId String
  resolutionState     String   @default("OPEN") // OPEN | RESOLVED | SUPERSEDED | UNRESOLVED
  resolvedAt          DateTime?
  resolvedBy          String?
  resolution          String?
  resolutionEvidenceId String?
  detectedAt          DateTime @default(now())
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  tenant              Tenant
  edge                SupplyChainEdge? @relation(fields: [edgeId], references: [id])
  node                SupplyChainNode? @relation(fields: [nodeId], references: [id])

  @@index([tenantId])
  @@index([edgeId])
  @@index([nodeId])
  @@index([conflictType])
  @@index([severity])
  @@index([resolutionState])
  @@index([detectedAt])
  @@map("supply_chain_conflicts")
}
```

### 4.10 Model: SupplyChainAssessment

```
SupplyChainAssessment {
  id                      String   @id @default(cuid())
  tenantId                String
  subjectType             String   // PRODUCT | SKU | SELLER | SUPPLIER | BRAND | ORGANIZATION
  subjectId               String
  status                  String   @default("PENDING") // PENDING | COMPLETE | STALE | CONTRADICTED | INSUFFICIENT
  algorithmVersion        String   @default("SUPPLY_CHAIN_ALGORITHM_V1")
  inputHash               String   // SHA-256 of canonical inputs for dedup
  graphCompleteness       Float    @default(0.0) // 0.0–1.0
  knownNodeCount          Int      @default(0)
  unknownNodeCount        Int      @default(0)
  knownEdgeCount          Int      @default(0)
  unknownEdgeCount        Int      @default(0)
  confirmedEdgeCount      Int      @default(0)
  corroboratedEdgeCount   Int      @default(0)
  claimedEdgeCount        Int      @default(0)
  observedEdgeCount       Int      @default(0)
  inferredEdgeCount       Int      @default(0)
  contradictedEdgeCount   Int      @default(0)
  sourceDiversity         Int      @default(0)
  evidenceCoverage        Float    @default(0.0)
  identityConfidence      Float    @default(0.0)
  temporalCoverage        Float    @default(0.0)
  pathCount               Int      @default(0)
  alternatePathCount      Int      @default(0)
  criticalUnknownCount    Int      @default(0)
  overallConfidence       Float    @default(0.0)
  nodeCompleteness        Float    @default(0.0)
  edgeCompleteness        Float    @default(0.0)
  evidenceCompleteness    Float    @default(0.0)
  identityCompleteness    Float    @default(0.0)
  temporalCompleteness    Float    @default(0.0)
  calculatedAt            DateTime @default(now())
  validFrom               DateTime?
  validTo                 DateTime?
  createdAt               DateTime @default(now())
  updatedAt               DateTime  @updatedAt

  tenant                  Tenant

  @@unique([tenantId, subjectType, subjectId, inputHash])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, subjectType, subjectId])
  @@index([tenantId, overallConfidence])
  @@index([tenantId, algorithmVersion])
  @@index([inputHash])
  @@index([calculatedAt])
  @@map("supply_chain_assessments")
}
```

### 4.11 Model: SupplyChainDecision

Immutable calculation snapshot.

```
SupplyChainDecision {
  id                      String   @id @default(cuid())
  assessmentId            String
  algorithmVersion        String
  evidenceStrengthScore   Float    @default(0)
  independenceScore       Float    @default(0)
  identityScore           Float    @default(0)
  directnessScore         Float    @default(0)
  corroborationScore      Float    @default(0)
  freshnessScore          Float    @default(0)
  contradictionPenalty    Float    @default(0)
  completenessScore       Float    @default(0)
  finalConfidence         Float
  inputHash               String
  edgeIds                 Json     @default("[]")
  evidenceIds             Json     @default("[]")
  observationIds          Json     @default("[]")
  calculatedAt            DateTime @default(now())

  assessment              SupplyChainAssessment @relation(fields: [assessmentId], references: [id])

  @@index([assessmentId])
  @@index([calculatedAt])
  @@index([algorithmVersion])
  @@unique([assessmentId, inputHash])
  @@map("supply_chain_decisions")
}
```

### 4.12 Model: SupplyChainVerification

```
SupplyChainVerification {
  id                String   @id @default(cuid())
  tenantId          String
  assessmentId      String
  verificationType  String   // VERIFY_SUPPLIER_AUTHORIZATION | VERIFY_MANUFACTURER_RELATIONSHIP | VERIFY_EXPORTER_IDENTITY | VERIFY_IMPORTER_IDENTITY | VERIFY_ORIGIN | VERIFY_TRADE_ROUTE | VERIFY_BANGLADESH_DISTRIBUTOR
  priority          String   // low | medium | high | critical
  reason            String
  targetNodeType    String?
  targetNodeId      String?
  targetEdgeType    String?
  targetEdgeId      String?
  existingEvidence  Json     @default("[]")
  missingEvidence   Json     @default("[]")
  importance        Float    @default(0.5) // 0.0–1.0
  createdAt         DateTime @default(now())

  tenant            Tenant
  assessment        SupplyChainAssessment @relation(fields: [assessmentId], references: [id])

  @@index([tenantId])
  @@index([assessmentId])
  @@index([verificationType])
  @@index([priority])
  @@map("supply_chain_verifications")
}
```

### 4.13 Model: SupplyChainClaim

Supplier/party claims, stored separately from verified relationships.

```
SupplyChainClaim {
  id              String   @id @default(cuid())
  tenantId        String
  claimType       String   // AUTHORIZED_DISTRIBUTOR | FACTORY_DIRECT | OFFICIAL_IMPORTER | MANUFACTURER | EXCLUSIVE_DISTRIBUTOR | OEM_MANUFACTURER | ORIGINAL_SUPPLIER
  claimText       String
  claimingNodeId  String
  targetNodeId    String
  sourceId        String
  evidenceId      String?
  observedAt      DateTime @default(now())
  retrievedAt     DateTime @default(now())
  status          String   @default("UNVERIFIED") // UNVERIFIED | UNDER_REVIEW | VERIFIED | REJECTED
  verifiedAt      DateTime?
  verifiedBy      String?
  validFrom       DateTime?
  validTo         DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tenant          Tenant
  claimingNode    SupplyChainNode @relation("ClaimClaiming", fields: [claimingNodeId], references: [id])
  targetNode      SupplyChainNode @relation("ClaimTarget", fields: [targetNodeId], references: [id])

  @@index([tenantId])
  @@index([claimingNodeId])
  @@index([targetNodeId])
  @@index([claimType])
  @@index([status])
  @@index([observedAt])
  @@map("supply_chain_claims")
}
```

### 4.14 Model: SupplyChainAnomaly

```
SupplyChainAnomaly {
  id              String   @id @default(cuid())
  tenantId        String
  anomalyType     String   // INVALID_RELATIONSHIP | SELF_LOOP | CONTRADICTORY_MANUFACTURER | CONTRADICTORY_ORIGIN | TEMPORAL_OVERLAP | SUSPICIOUS_SHORTCUT | CYCLE_DETECTED
  severity        String   // low | medium | high | critical
  description     String
  nodeId          String?
  edgeId          String?
  involvedNodeIds Json     @default("[]")
  involvedEdgeIds Json     @default("[]")
  status          String   @default("OPEN") // OPEN | UNDER_REVIEW | RESOLVED | DISMISSED
  resolvedAt      DateTime?
  resolvedBy      String?
  resolution      String?
  detectedAt      DateTime @default(now())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tenant          Tenant

  @@index([tenantId])
  @@index([anomalyType])
  @@index([severity])
  @@index([status])
  @@index([detectedAt])
  @@map("supply_chain_anomalies")
}
```

### 4.15 Tenant Back-Relations (Additive Change)

Add to the existing `Tenant` model:

```
// Phase 9: Supply-Chain Tracing
supplyChainNodes          SupplyChainNode[]
supplyChainEdges          SupplyChainEdge[]
supplyChainObservations   SupplyChainObservation[]
supplyChainEvidenceLinks  SupplyChainEvidenceLink[]
supplyChainConflicts      SupplyChainConflict[]
supplyChainAssessments    SupplyChainAssessment[]
supplyChainDecisions      SupplyChainDecision[]
supplyChainVerifications  SupplyChainVerification[]
supplyChainClaims         SupplyChainClaim[]
supplyChainAnomalies      SupplyChainAnomaly[]
```

### 4.16 Evidence Back-Relation (Additive Change)

Add to existing `Evidence` model:

```
supplyChainObservations   SupplyChainObservation[]
supplyChainEvidenceLinks  SupplyChainEvidenceLink[] @relation("SCEvidenceLink")
```

### 4.17 Source Back-Relation (Additive Change)

Add to existing `Source` model:

```
supplyChainObservations   SupplyChainObservation[]
```

---

## 5. Node Taxonomy

Every node type maps to the reuse strategy:

| NodeType | Reuse Strategy |
|----------|---------------|
| PRODUCT | `canonicalEntityType="product"`, `canonicalEntityId=Product.id` |
| SKU | `canonicalEntityType="productVariant"`, `canonicalEntityId=ProductVariant.id` |
| BRAND | `canonicalEntityType="brand"`, `canonicalEntityId=Brand.id` |
| MANUFACTURER | `canonicalEntityType="manufacturer"`, `canonicalEntityId=Manufacturer.id` |
| AUTHORIZED_DISTRIBUTOR | `canonicalEntityType="organization"`, `canonicalEntityId=Organization.id` |
| DISTRIBUTOR | `canonicalEntityType="organization"`, `canonicalEntityId=Organization.id` |
| SUPPLIER | `canonicalEntityType="supplier"`, `canonicalEntityId=Supplier.id` |
| SELLER | `canonicalEntityType="seller"`, `canonicalEntityId=Seller.id` |
| LISTING | New node, no canonical entity; uses `metadata` for listing data |
| OFFER | New node, similar to LISTING |
| FULFILLMENT_PROVIDER | New node, `metadata` for provider details |
| WAREHOUSE | New node, `metadata` for warehouse details |
| EXPORTER | `canonicalEntityType="organization"` where resolved |
| IMPORTER | `canonicalEntityType="organization"` where resolved |
| ORIGIN_COUNTRY/REGION/CITY | New node, `country` field for ISO code |
| PORT | New node, `metadata` for port code |
| TRADE_ROUTE | New node, `metadata` for route details |
| SHIPMENT | New node, `metadata` for shipment data |
| TRADE_OBSERVATION | New node, `metadata` for trade observation |
| DESTINATION_COUNTRY/REGION/CITY | New node |
| BANGLADESH_* | New nodes or `canonicalEntityType="organization"` where resolved |
| UNKNOWN | Virtual node type for missing links |

**No duplicate canonical entities are created.** Where a canonical entity exists, the node references it.

---

## 6. Edge Taxonomy

See §4.2 for the complete enum. Each edge type has defined source→target node type constraints:

| Edge Type | Valid From NodeType | Valid To NodeType |
|-----------|-------------------|-----------------|
| BRAND_MANUFACTURES_PRODUCT | BRAND | PRODUCT |
| MANUFACTURER_PRODUCES_SKU | MANUFACTURER | SKU |
| MANUFACTURER_DISTRIBUTES | MANUFACTURER | DISTRIBUTOR |
| MANUFACTURER_SUPPLIES | MANUFACTURER | SUPPLIER |
| MANUFACTURER_EXPORTS | MANUFACTURER | EXPORTER |
| AUTHORIZED_DISTRIBUTOR_DISTRIBUTES | AUTHORIZED_DISTRIBUTOR | DISTRIBUTOR |
| DISTRIBUTOR_SUPPLIES | DISTRIBUTOR | SUPPLIER |
| SUPPLIER_SUPPLIES | SUPPLIER | SELLER |
| SUPPLIER_SOURCES_FROM | SUPPLIER | MANUFACTURER |
| SELLER_PURCHASES_FROM | SELLER | SUPPLIER |
| SELLER_SUPPLIES | SELLER | SELLER |
| SELLER_LISTS | SELLER | LISTING |
| SELLER_OFFERS | SELLER | OFFER |
| LISTING_REPRESENTS_PRODUCT | LISTING | PRODUCT |
| LISTING_OFFERS_SKU | LISTING | SKU |
| FULFILLMENT_BY | LISTING | FULFILLMENT_PROVIDER |
| STORED_AT | PRODUCT | WAREHOUSE |
| ORIGINATED_FROM | PRODUCT/SKU | ORIGIN_COUNTRY/REGION/CITY |
| EXPORTED_FROM | EXPORTER | ORIGIN_COUNTRY/PORT |
| IMPORTED_TO | IMPORTER | DESTINATION_COUNTRY/PORT |
| EXPORTER_EXPORTS | EXPORTER | SHIPMENT |
| IMPORTER_IMPORTS | IMPORTER | SHIPMENT |
| SHIPMENT_FROM | SHIPMENT | ORIGIN/PORT |
| SHIPMENT_TO | SHIPMENT | DESTINATION/PORT |
| TRADE_OBSERVATION_SUPPORTS | TRADE_OBSERVATION | EDGE/NODE |
| DESTINATION_TO | SHIPMENT | DESTINATION_COUNTRY/REGION/CITY |
| SOLD_IN_MARKET | PRODUCT/SKU | BANGLADESH_MARKET_ENTITY |
| BANGLADESH_IMPORTER_DISTRIBUTES | BANGLADESH_IMPORTER | BANGLADESH_DISTRIBUTOR |
| BANGLADESH_DISTRIBUTOR_SUPPLIES | BANGLADESH_DISTRIBUTOR | BANGLADESH_RESELLER |
| BANGLADESH_SUPPLIER_SUPPLIES | BANGLADESH_MARKET_ENTITY | SELLER |
| BANGLADESH_RESELLER_SELLS | BANGLADESH_RESELLER | LISTING |

---

## 7. Relationship Status Semantics

### OBSERVED
Directly observed in a source. Example: a supplier website explicitly lists a product. Does NOT prove manufacturer ownership. Requires ≥1 evidence record from a direct source.

### CLAIMED
A party states the relationship. Example: seller claims "factory direct." Remains a claim until independently supported. Requires ≥1 SupplyChainClaim record.

### INFERRED
Derived by deterministic reasoning from available evidence. Must never be represented as directly observed. Requires documented inference rule and ≥2 supporting evidence records.

### CORROBORATED
Multiple sufficiently independent evidence sources support the same relationship. Requires `sourceDiversity ≥ 2` with independent sources (different `sourceId`, different `domain`, different upstream origin).

### CONFIRMED
The relationship satisfies deterministic confirmation rules:
- `sourceDiversity ≥ 3` independent sources, OR
- `sourceDiversity ≥ 2` with at least one DIRECT evidence strength, AND
- No unresolved contradictions, AND
- `identityConfidence ≥ 0.8` for both nodes, AND
- `evidenceStrength ≥ 0.7`

### CONTRADICTED
Evidence exists that conflicts with the relationship. The original relationship is NOT deleted. `isContradicted = true` and `contradictionCount > 0`.

### UNKNOWN
The system cannot establish whether the relationship exists. No evidence. Used for missing links in paths.

---

## 8. Evidence & Provenance Model

Every non-UNKNOWN edge MUST have evidence via this chain:

```
SupplyChainEdge
  → SupplyChainEvidenceLink (role: SUPPORTING|CONTRADICTING|CONTEXTUAL)
    → Evidence (Phase 6)
      → Source
        → RawResponse → Observation
```

Each edge must answer:
1. What relationship is asserted? → `edgeType`
2. Who are the two nodes? → `fromNode`, `toNode`
3. Where did it come from? → `SupplyChainObservation.sourceId`
4. What evidence supports it? → `SupplyChainEvidenceLink.evidenceId`
5. When observed? → `observedAt`
6. When retrieved? → `retrievedAt`
7. Which source? → `Source.id`, `Source.type`
8. Direct or inferred? → `observationStatus`
9. What confidence? → `edge.confidence`
10. Contradictory evidence? → `edge.isContradicted`, `SupplyChainConflict`
11. Currently valid? → `validFrom`/`validTo`
12. Historical validity? → `SupplyChainObservation.validFrom`/`validTo`

---

## 9. Source Independence & Corroboration Rules

### Source Identity Tracking
Each source has: `sourceId`, `Source.type`, `Source.name`, domain (from config).

### Independence Rules
1. Same `sourceId` → NOT independent
2. Same domain/provider → NOT independent (e.g., two Alibaba pages from same seller)
3. Same upstream origin (if traceable) → NOT independent
4. Different `sourceId` + different domain + different provider → independent

### Corroboration Progression
```
1 independent source  → OBSERVED (if direct) or CLAIMED (if self-claim)
2 independent sources → CORROBORATED (if consistent)
3+ independent sources → eligible for CONFIRMED (if all other rules met)
Any contradicting source → CONTRADICTED (preserved alongside original)
```

### Duplicate Detection
Content hash of `(tenantId, sourceId, edgeType, fromNodeId, toNodeId, observedValue)` prevents duplicate observations from the same source.

---

## 10. Temporal Model & Historical Reconstruction

### Every observation records:
- `observedAt` — when the data was observed/published
- `retrievedAt` — when the system fetched it
- `validFrom` — when the relationship became valid (null if unknown)
- `validTo` — when the relationship became invalid (null if still valid)

### Historical Reconstruction
Given a query at `asOf` date:
1. Filter observations where `validFrom ≤ asOf` AND (`validTo IS NULL` OR `validTo > asOf`)
2. Recompute edge status from filtered observations
3. Return the graph state as of that date

### Immutability
Historical observations are NEVER modified. New evidence creates new observations. Corrections are new observations with appropriate `validFrom`.

---

## 11. Confidence Model

### Edge Confidence Formula (deterministic, centralized config)

```
edgeConfidence = 
  evidenceStrength   (0.25) × 
  sourceIndependence (0.20) × 
  identityConfidence (0.20) × 
  directness         (0.15) × 
  corroboration      (0.10) × 
  temporalFreshness  (0.10)
  - contradictionPenalty
```

### Component Definitions

| Component | Formula | Range |
|-----------|---------|-------|
| evidenceStrength | weighted avg of evidence strength values (DIRECT=1.0, STRONG=0.8, MODERATE=0.6, WEAK=0.3, CONTEXTUAL=0.2) | 0–1 |
| sourceIndependence | min(1.0, distinctSourceCount / 3) | 0–1 |
| identityConfidence | (fromNode.identityConfidence + toNode.identityConfidence) / 2 | 0–1 |
| directness | OBSERVED=1.0, CORROBORATED=0.9, CONFIRMED=0.95, CLAIMED=0.5, INFERRED=0.6, UNKNOWN=0.0 | 0–1 |
| corroboration | min(1.0, supportingEvidenceCount / 5) | 0–1 |
| temporalFreshness | 1.0 if <7d, 0.8 if <30d, 0.6 if <90d, 0.4 if <180d, 0.2 if <365d, 0.1 otherwise | 0–1 |
| contradictionPenalty | 0.15 × min(1.0, contradictionCount) | 0–0.15 |

### Algorithm Version
All calculations persist `algorithmVersion = "SUPPLY_CHAIN_ALGORITHM_V1"`.

### Configuration Object
All weights in `SUPPLY_CHAIN_CONFIG` in `@exosquad/common`:

```typescript
export const SUPPLY_CHAIN_CONFIG = {
  algorithmVersion: "SUPPLY_CHAIN_ALGORITHM_V1",
  confidenceWeights: {
    evidenceStrength: 0.25,
    sourceIndependence: 0.20,
    identityConfidence: 0.20,
    directness: 0.15,
    corroboration: 0.10,
    temporalFreshness: 0.10,
  },
  directnessValues: {
    OBSERVED: 1.0, CONFIRMED: 0.95, CORROBORATED: 0.9,
    INFERRED: 0.6, CLAIMED: 0.5, UNKNOWN: 0.0,
  },
  evidenceStrengthValues: {
    DIRECT: 1.0, STRONG: 0.8, MODERATE: 0.6, WEAK: 0.3, CONTEXTUAL: 0.2,
  },
  temporalFreshnessDecay: [
    { maxDays: 7, value: 1.0 }, { maxDays: 30, value: 0.8 },
    { maxDays: 90, value: 0.6 }, { maxDays: 180, value: 0.4 },
    { maxDays: 365, value: 0.2 }, { maxDays: Infinity, value: 0.1 },
  ],
  contradictionPenaltyFactor: 0.15,
  confirmationRules: {
    minSourceDiversity: 3,
    minDirectEvidence: true,
    minIdentityConfidence: 0.8,
    minEvidenceStrength: 0.7,
    noUnresolvedContradictions: true,
  },
  corroborationRules: {
    minSourceDiversity: 2,
    requireConsistency: true,
  },
  traversalDefaults: {
    maxDepth: 10,
    defaultMaxDepth: 5,
  },
} as const;
```

---

## 12. Completeness Model

Five dimensions, each 0.0–1.0:

```
nodeCompleteness    = knownNodes / (knownNodes + unknownNodes)
edgeCompleteness    = knownEdges / (knownEdges + unknownEdges)
evidenceCompleteness = edgesWithEvidence / totalNonUnknownEdges
identityCompleteness = resolvedNodes / totalNodes
temporalCompleteness = edgesWithTemporalData / totalNonUnknownEdges

graphCompleteness = (nodeCompleteness + edgeCompleteness + evidenceCompleteness + identityCompleteness + temporalCompleteness) / 5
```

---

## 13. Contradiction Model

Contradictions are first-class. Detection triggers:
1. Same edge (same fromNode, toNode, edgeType) with conflicting evidence from different sources
2. Same subject with different values (e.g., two different manufacturers for same SKU)
3. Temporal overlap conflicts (two mutually exclusive relationships simultaneously valid)
4. Self-loop detection (node pointing to itself)
5. Invalid relationship type for node type combination

### Conflict Record
```
SupplyChainConflict {
  conflictType, severity, description,
  supportingEvidenceId, contradictingEvidenceId,
  resolutionState: OPEN | RESOLVED | SUPERSEDED | UNRESOLVED,
  resolvedAt, resolvedBy, resolution, resolutionEvidenceId
}
```

Contradicted edges retain `isContradicted = true` and reduce confidence but are NOT deleted.

---

## 14. Graph Traversal & Path Reconstruction

### Multi-Hop Path Discovery
BFS/DFS with bounded depth. Returns:
- path nodes, path edges, edge statuses, edge confidence
- supporting evidence, contradictions, temporal validity
- overall path confidence = product of edge confidences along path

### Alternate Paths
Multiple paths between same endpoints are preserved. NOT collapsed to single path.

### Traversal Controls
Every traversal supports:
```
maxDepth (default: 5, max: 10)
nodeTypes (filter)
edgeTypes (filter)
statuses (filter)
minimumConfidence (filter)
asOf (temporal reconstruction)
tenantId (always enforced)
```

### Cycle Detection
DFS with visited-set tracking. Cycles are:
1. Detected and recorded as `SupplyChainAnomaly` (type: `CYCLE_DETECTED`)
2. Underlying edges preserved
3. Traversal terminates at cycle boundary
4. Configurable max depth prevents unbounded recursion

---

## 15. Unknown / Unresolved / Unavailable Distinction

| State | Meaning | Representation |
|-------|---------|---------------|
| UNKNOWN | No evidence establishing the relationship | Edge with `relationshipStatus = UNKNOWN`, no evidence |
| UNRESOLVED | Evidence exists but identity resolution insufficient | Node with `identityStatus = "unresolved"` or `"ambiguous"` |
| UNAVAILABLE | Required external data source unavailable | Tracked in assessment metadata, not as a graph state |
| CONTRADICTED | Conflicting evidence exists | Edge with `isContradicted = true` + `SupplyChainConflict` record |

These are NEVER collapsed into a single null value.

---

## 16. Assessment & Verification

### Assessment Layer
Deterministic summary of graph state for a subject (product, seller, etc.). See §4.10 for fields.

### Verification Requirements
Generated when links are unknown/unresolved:

| Type | Trigger |
|------|---------|
| VERIFY_SUPPLIER_AUTHORIZATION | Supplier claims authorization but no independent evidence |
| VERIFY_MANUFACTURER_RELATIONSHIP | Product→Manufacturer link unknown or claimed only |
| VERIFY_EXPORTER_IDENTITY | Exporter node unresolved |
| VERIFY_IMPORTER_IDENTITY | Importer node unresolved |
| VERIFY_ORIGIN | Origin unknown or contradicted |
| VERIFY_TRADE_ROUTE | No trade evidence for claimed route |
| VERIFY_BANGLADESH_DISTRIBUTOR | Bangladesh distributor link unknown |

Each verification record contains: type, priority, reason, target node/edge, existing evidence, missing evidence, importance score.

---

## 17. Anomaly Detection

Deterministic detection for:

| Anomaly Type | Detection Rule |
|-------------|---------------|
| INVALID_RELATIONSHIP | Edge type invalid for from/to node types (per §6 table) |
| SELF_LOOP | fromNodeId === toNodeId |
| CONTRADICTORY_MANUFACTURER | Same SKU→Manufacturer with different Manufacturer nodes |
| CONTRADICTORY_ORIGIN | Same product→Origin with different origin nodes |
| TEMPORAL_OVERLAP | Two mutually exclusive edges simultaneously valid |
| SUSPICIOUS_SHORTCUT | SELLER→MANUFACTURER with no evidence despite claimed chain |
| CYCLE_DETECTED | Graph traversal detects cycle |

Anomalies recorded as `SupplyChainAnomaly` with severity, status, involved entities.

---

## 18. Integration Contracts

### 18.1 Product/SKU Integration
- SupplyChainNode references `Product` and `ProductVariant` via `canonicalEntityType`/`canonicalEntityId`
- Uses existing Phase 4 identity resolution outputs (`identityStatus`, `confidence`)
- Does NOT duplicate identity resolution logic

### 18.2 Seller/Supplier Integration
- SupplyChainNode references `Seller`, `Supplier`, `Manufacturer` via canonical references
- Uses existing Phase 5 identity resolution outputs
- Uses `Organization` for resolved distributor/importer/exporter entities

### 18.3 Evidence Integration
- `SupplyChainEvidenceLink` references Phase 6 `Evidence` records
- `SupplyChainObservation` optionally references `Evidence`
- Does NOT duplicate evidence storage

### 18.4 Authenticity Integration
- Supply Chain may READ authenticity assessment outputs as supporting evidence
- Does NOT transform authenticity confidence into supply-chain confidence
- Separate intelligence dimensions

### 18.5 Demand Integration
- Supply Chain may READ demand outputs for contextualization
- Demand score ≠ supply-chain truth
- No demand→supply-chain confidence transformation

### 18.6 Opportunity Integration (Preservation)
- Existing Opportunity engine remains UNCHANGED
- Supply Chain exposes structured data for future Opportunity consumption:
  ```
  supplyChainAssessmentId, graphCompleteness, primaryPaths,
  alternatePathCount, criticalUnknownLinks, contradictionCount,
  supplierCount, manufacturerCount, originCount, importerCount,
  bangladeshEntityCount, confidence
  ```
- No Opportunity scoring changes in Phase 9

### 18.7 Phase 10 Logistics Contract (Downstream)
Phase 9 exposes for future Logistics consumption:
```
origin, exporter, exportPort, shipmentObservations, destinationPort,
importer, bangladeshDestination, knownRoutes, alternateRoutes,
routeEvidence, routeTimestamps, routeConfidence, routeContradictions
```
Read-only service contract. No logistics calculations in Phase 9.

### 18.8 Phase 11 Landed Cost Contract (Downstream)
Phase 9 exposes for future Landed Cost consumption:
```
supplier, origin, exporter, importer, shipmentEvidence, route,
destination, historicalTradeObservations, quantity, weight, value,
currency, dates
```
No freight/customs/tax/insurance/landed-cost calculations in Phase 9.

---

## 19. API Surface

All endpoints under `/api/v1/supply-chain`. Auth required (JWT). Tenant from JWT.

### 19.1 Assessment Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/assess` | Trigger supply-chain assessment for a subject |
| GET | `/` | List assessments (paginated, filterable) |
| GET | `/:id` | Get assessment with full graph summary |
| POST | `/:id/recalculate` | Force recalculation |
| GET | `/:id/nodes` | List nodes in assessment graph |
| GET | `/:id/edges` | List edges in assessment graph |
| GET | `/:id/paths` | Get discovered supply-chain paths |
| GET | `/:id/evidence` | Get evidence for assessment graph |
| GET | `/:id/conflicts` | Get conflicts/contradictions |
| GET | `/:id/provenance` | Get full provenance chain |
| GET | `/:id/history` | Get historical assessments |
| GET | `/:id/verifications` | Get verification requirements |
| GET | `/:id/anomalies` | Get detected anomalies |

### 19.2 Edge Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/edges/:id` | Get edge detail |
| GET | `/edges/:id/provenance` | Get edge provenance chain |
| GET | `/edges/:id/observations` | Get edge observations |

### 19.3 Claim Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/claims` | Record a supply-chain claim |
| GET | `/claims` | List claims |
| GET | `/claims/:id` | Get claim detail |

### 19.4 Relationship Query Endpoint

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/relationships` | Query relationships with filters |

Query parameters: `nodeType`, `edgeType`, `status`, `confidence`, `sourceId`, `country`, `productId`, `sellerId`, `supplierId`, `manufacturerId`, `hasContradiction`, `hasEvidence`, `asOf`, `page`, `limit`.

Answers questions like:
- Who supplies Seller X? → `nodeType=SELLER&edgeType=SELLER_PURCHASES_FROM`
- Where does SKU X originate? → `nodeType=SKU&edgeType=ORIGINATED_FROM`
- Which Bangladesh entities connected? → `nodeType=BANGLADESH_*`

### 19.5 Filtering (All List Endpoints)

```
tenantId (from JWT, always)
nodeType, edgeType, status, confidence (min/max)
sourceId, country, productId, skuId, sellerId, supplierId, manufacturerId
hasContradiction (boolean), hasEvidence (boolean)
asOf (date for temporal reconstruction)
page, limit, sortBy, sortOrder
```

### 19.6 Response Format

```json
{
  "data": { ... },
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

Error format:
```json
{
  "error": { "code": "NOT_FOUND", "message": "...", "context": { ... } }
}
```

---

## 20. Queue, Worker & Scheduler

### 20.1 Queue

Name: `supply_chain`
Registered in `apps/worker/src/queues/queue-manager.ts`.

Configuration:
- Concurrency: `max(1, WORKER_CONCURRENCY / 2)`
- Rate limiter: 20 jobs/minute
- Retry: 3 attempts, exponential backoff (5000ms base)
- removeOnComplete: 1000, removeOnFail: 5000

### 20.2 Worker Jobs

| Job Name | Purpose |
|----------|---------|
| `supply-chain:build` | Build graph for a subject from evidence |
| `supply-chain:recalculate` | Recalculate edge statuses and confidence |
| `supply-chain:refresh` | Refresh stale assessments |
| `supply-chain:detect-conflicts` | Detect contradictions and conflicts |
| `supply-chain:detect-anomalies` | Detect graph anomalies |
| `supply-chain:expire` | Expire relationships past validTo |

Worker processor: `apps/worker/src/processors/supply-chain.ts`

**CRITICAL**: Processor is self-contained with direct Prisma access. Does NOT import `apps/api` services.

### 20.3 Scheduler

`SupplyChainScheduler` in `apps/worker/src/scheduler/supply-chain-scheduler.ts`.

Pattern: follows `OpportunityScheduler` / `AuthenticityScheduler` pattern.

Interval: every 12 hours (configurable).

Triggers when:
- New evidence created since last assessment
- Evidence changed since last assessment
- Product/SKU resolution changed
- Seller/Supplier resolution changed
- Relationship past `validTo` date
- Unresolved conflicts exist
- Assessment is stale (>24h since last calculation)

Registered in `apps/worker/src/app.ts`.

---

## 21. Idempotency & Concurrency

### Idempotency
- `SupplyChainEdge`: unique on `(tenantId, fromNodeId, toNodeId, edgeType, contentHash)`
- `SupplyChainObservation`: unique on `(tenantId, edgeId, sourceId, contentHash)`
- `SupplyChainAssessment`: unique on `(tenantId, subjectType, subjectId, inputHash)`
- `SupplyChainDecision`: unique on `(assessmentId, inputHash)`
- Content hash = SHA-256 of canonical inputs

### Concurrency
- Database uniqueness constraints prevent duplicates at DB level
- Upsert patterns (`upsert` with `where` + `create`) for safe concurrent creation
- Transactions for multi-step operations (edge + observation + evidence link)
- No `findFirst → create` without DB-level protection

---

## 22. Observability & Metrics

### Structured Logging
All operations log with: `tenantId`, `entityId`, `assessmentId`, `jobId`, `algorithmVersion`, `duration`.

Events logged: graph build, recalculation, edge creation, edge dedup, conflict detection, anomaly detection, path calculation, scheduler execution, worker execution, failure/retry.

### Metrics (following existing conventions)
```
supply_chain_assessments_total
supply_chain_edges_total
supply_chain_conflicts_total
supply_chain_anomalies_total
supply_chain_unknown_links_total
supply_chain_recalculations_total
supply_chain_job_failures_total
supply_chain_assessment_duration
```

---

## 23. Security

- All endpoints require JWT authentication
- Tenant extracted from JWT, never from client
- Every query filtered by `tenantId`
- IDs validated (cuid format)
- Enums validated (Zod)
- Pagination validated (max 100 per page)
- Traversal depth validated (max 10)
- No unbounded graph traversal
- No SQL injection vectors (Prisma parameterized queries)

---

## 24. Performance

### Bounded Traversal
- Max depth: 10 (configurable, default 5)
- No unbounded recursion
- BFS with visited set for cycle detection

### Query Optimization
- Batch-load nodes, edges, evidence, sources
- No N+1 queries (use `whereIn` for batch loading)
- Pagination for large result sets
- Bounded evidence windows (max 100 per edge)
- Parallel independent data loading with `Promise.all`

### Indexes
All models have indexes on: `tenantId`, foreign keys, status fields, `contentHash`, temporal fields. Composite indexes for common query patterns.

---

## 25. Test Plan

### 25.1 Unit Tests (target: ≥35 tests)

| # | Test |
|---|------|
| 1 | Node normalization from canonical entity |
| 2 | Node identity reuse (no duplicate for same canonical entity) |
| 3 | Edge creation with correct from/to nodes |
| 4 | Edge deduplication via content hash |
| 5 | Evidence attachment to edge |
| 6 | OBSERVED relationship creation |
| 7 | CLAIMED relationship from supplier self-claim |
| 8 | INFERRED relationship from deterministic rule |
| 9 | CORROBORATED relationship from 2+ independent sources |
| 10 | CONFIRMED relationship meeting all confirmation rules |
| 11 | CONTRADICTED relationship preservation |
| 12 | UNKNOWN relationship for missing links |
| 13 | Confidence calculation correctness |
| 14 | Source independence detection |
| 15 | Contradiction detection (explicit) |
| 16 | Contradiction detection (implicit via content hash divergence) |
| 17 | Temporal validity filtering |
| 18 | Historical reconstruction at date |
| 19 | Path discovery (multi-hop) |
| 20 | Alternate path preservation |
| 21 | Cycle detection |
| 22 | Traversal depth limit enforcement |
| 23 | Completeness calculation |
| 24 | Verification requirement generation |
| 25 | Deterministic hashing (same inputs → same hash) |
| 26 | Idempotency (same observation not duplicated) |
| 27 | Algorithm versioning persistence |
| 28 | Anomaly detection: self-loop |
| 29 | Anomaly detection: invalid relationship |
| 30 | Anomaly detection: contradictory manufacturer |
| 31 | Anomaly detection: contradictory origin |
| 32 | Anomaly detection: suspicious shortcut |
| 33 | Marketplace listing NOT treated as manufacturer proof |
| 34 | Claim remains CLAIMED until corroborated |
| 35 | Confidence ≠ status (independent dimensions) |

### 25.2 Integration Tests (target: ≥24 tests)

| # | Test |
|---|------|
| 1 | Complete graph creation end-to-end |
| 2 | Partial graph with unknown links |
| 3 | Multi-hop path retrieval |
| 4 | Multiple alternate paths |
| 5 | Contradictory evidence preservation |
| 6 | Historical graph reconstruction |
| 7 | Evidence provenance chain traversal |
| 8 | Source provenance chain |
| 9 | Duplicate ingestion idempotency |
| 10 | Concurrent ingestion safety |
| 11 | Cross-tenant isolation (Tenant A cannot see Tenant B) |
| 12 | API authorization (unauthenticated rejected) |
| 13 | Worker job execution (build) |
| 14 | Worker job execution (recalculate) |
| 15 | Scheduler behavior (enqueue on stale) |
| 16 | Recalculation preserves history |
| 17 | Expired relationship handling |
| 18 | Large graph pagination |
| 19 | Assessment API end-to-end |
| 20 | Relationship query with filters |
| 21 | Edge provenance endpoint |
| 22 | Claim recording and verification |
| 23 | Anomaly detection in graph |
| 24 | Verification requirement generation |

### 25.3 Adversarial Tests (10 required cases)

| Case | Scenario | Expected |
|------|----------|---------|
| 1 | Marketplace-only claim ("Factory direct") | `status = CLAIMED`, not CONFIRMED |
| 2 | 3 independent sources same relationship | `status` progresses to CORROBORATED/CONFIRMED, `sourceDiversity > 1` |
| 3 | Contradictory manufacturer (A vs B) | Both preserved, conflict created, no silent overwrite |
| 4 | Missing distributor | `Manufacturer → UNKNOWN → Supplier`, no invented distributor |
| 5 | Historical supplier change | Old relationship queryable historically, new separate |
| 6 | Duplicate evidence ingestion | No duplicate observation/edge |
| 7 | Cross-tenant lookup | 404/403 for Tenant A requesting Tenant B graph |
| 8 | Conflicting trade evidence | Both preserved, conflict detected, confidence affected |
| 9 | Cycle A→B→C→A | Cycle detected, traversal terminates, graph preserved |
| 10 | Evidence removed from source | Historical assessment reconstructable |

### 25.4 Regression Tests

Confirm all existing tests remain passing:
- Phase 7 Demand tests
- Phase 8 Authenticity tests
- Phase 8 Opportunity tests
- Phase 6 Evidence tests
- All existing API endpoints

### 25.5 Test Commands

```bash
# Unit tests
pnpm run test

# Integration tests
cd apps/api && pnpm run test:integration

# Full build
pnpm run build

# Lint
pnpm run lint
```

---

## 26. Migration Strategy

1. Add new models and enums to `packages/database/prisma/schema.prisma`
2. Add back-relations to existing `Tenant`, `Evidence`, `Source` models
3. Run `npx prisma validate` to verify schema
4. Generate migration:
   ```bash
   npx prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/<timestamp>_phase9_supply_chain/migration.sql
   ```
5. Apply: `npx prisma migrate deploy`
6. Generate client: `npx prisma generate`

Migration folder name: `<timestamp>_phase9_supply_chain` (timestamp sorts after all existing phase folders).

All changes are additive (new tables + new columns on Tenant). No destructive changes to existing tables.

---

## 27. File Inventory

### New Files

| File | Purpose |
|------|---------|
| `apps/api/src/services/supply-chain-engine.ts` | Core graph engine: node/edge creation, confidence, contradiction, path discovery, anomaly detection |
| `apps/api/src/services/supply-chain-intelligence.ts` | Orchestrator: assessment, recalculation, history, provenance |
| `apps/api/src/routes/supply-chain.ts` | API routes |
| `apps/worker/src/processors/supply-chain.ts` | Worker processor (self-contained, direct Prisma) |
| `apps/worker/src/scheduler/supply-chain-scheduler.ts` | Scheduler |
| `apps/api/test/unit/supply-chain-engine.test.ts` | Unit tests |
| `apps/api/test/integration/supply-chain.test.ts` | Integration tests |

### Modified Files

| File | Change |
|------|--------|
| `packages/database/prisma/schema.prisma` | Add 10 new models, 3 enums, back-relations |
| `packages/common/src/index.ts` | Add Phase 9 enums, types, SUPPLY_CHAIN_CONFIG |
| `apps/api/src/app.ts` | Register supply-chain routes |
| `apps/worker/src/app.ts` | Register SupplyChainScheduler |
| `apps/worker/src/queues/queue-manager.ts` | Register supply_chain queue + worker |
| `AGENTS.md` | Update Phase 9 status |

---

## 28. Documentation

Output: `PHASE9_SUPPLY_CHAIN_REPORT.md` containing:
1. Implementation summary
2. Architecture
3. Data model
4. Node taxonomy
5. Edge taxonomy
6. Relationship status semantics
7. Evidence model
8. Provenance model
9. Confidence model
10. Contradiction model
11. Temporal model
12. Path model
13. Anomaly detection
14. APIs
15. Worker jobs
16. Queue
17. Scheduler
18. Bangladesh-specific considerations
19. Downstream contracts
20. Performance considerations
21. Security
22. Observability
23. Test coverage
24. Known limitations
25. Future optimization candidates
26. Exact build/test/lint results

---

## 29. Acceptance Criteria

Phase 9 is complete ONLY when ALL of the following are true:

### Architecture
- [ ] Existing Phase 2–8 audited and preserved
- [ ] Existing canonical entities reused (no duplicates)
- [ ] Opportunity implementation unchanged
- [ ] No duplicate identity systems

### Graph
- [ ] SupplyChainNode with full taxonomy
- [ ] SupplyChainEdge with full taxonomy
- [ ] 7 relationship statuses with correct semantics
- [ ] Unknown relationships supported
- [ ] Contradictions preserved (not deleted)
- [ ] Multi-hop paths work
- [ ] Alternate paths preserved
- [ ] Cycle detection implemented
- [ ] Anomaly detection (7 types)

### Evidence
- [ ] Every non-UNKNOWN edge has evidence chain
- [ ] Evidence provenance-linked to Source
- [ ] Source identity preserved
- [ ] Source independence enforced
- [ ] Claims remain claims until corroborated
- [ ] Marketplace listings NOT treated as manufacturer proof

### Temporal
- [ ] observedAt, retrievedAt, validFrom, validTo on observations
- [ ] Historical reconstruction works
- [ ] Historical observations immutable

### Intelligence
- [ ] Deterministic confidence (centralized config)
- [ ] Deterministic completeness (5 dimensions)
- [ ] Contradiction detection
- [ ] Verification requirements generated
- [ ] Algorithm versioning persisted
- [ ] Reproducible calculations (same inputs → same outputs)

### Platform
- [ ] Tenant isolation on every query
- [ ] ≥13 API endpoints
- [ ] Queue registered
- [ ] Worker with 6 job types
- [ ] Scheduler (12-hour cycle)
- [ ] Retry with exponential backoff
- [ ] Structured logging
- [ ] Pagination on all list endpoints
- [ ] Traversal depth limits

### Integration
- [ ] Product/SKU via canonical references
- [ ] Seller/Supplier via canonical references
- [ ] Evidence via SupplyChainEvidenceLink
- [ ] Authenticity read contract (no duplication)
- [ ] Demand read contract (no merging)
- [ ] Opportunity unchanged + structured output
- [ ] Phase 10 Logistics data exposed
- [ ] Phase 11 Landed Cost data exposed

### Quality
- [ ] ≥35 unit tests passing
- [ ] ≥24 integration tests passing
- [ ] 10 adversarial tests passing
- [ ] Cross-tenant isolation tests passing
- [ ] Idempotency tests passing
- [ ] Temporal tests passing
- [ ] Regression tests passing (all existing tests green)
- [ ] `pnpm run build` succeeds
- [ ] `pnpm run lint` succeeds
- [ ] Documentation complete

---

## 30. Failure Modes & Recovery

| Failure | Recovery |
|---------|----------|
| Redis unavailable | Queue jobs fail with retry; BullMQ handles backoff |
| PostgreSQL unavailable | API returns 503; worker crashes and restarts |
| Concurrent duplicate ingestion | DB unique constraint rejects; upsert handles gracefully |
| Circular graph traversal | Cycle detection + max depth limit terminates |
| Stale assessment | Scheduler detects and enqueues refresh |
| Worker crash mid-job | BullMQ re-queues; idempotency prevents duplicates |
| Evidence retracted | New observation created; edge recalculated on next cycle |
| Cross-tenant access attempt | Tenant filter in every query returns 404 |

---

## 31. Structural Blockers (None Identified)

The audit found NO structural blockers. All required existing components are in place:
- Product/SKU/Brand/Seller/Supplier/Manufacturer/Organization models exist
- Evidence/Source/Observation infrastructure exists
- Identity resolution outputs are available
- Queue/worker/scheduler patterns are established
- API conventions are consistent

Phase 9 proceeds with implementation as specified.
